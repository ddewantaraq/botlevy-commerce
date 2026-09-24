import { Router } from "express";
import { z } from "zod";
import {
  abandonQuotedForSelfBuy,
  beginCommercePick,
  handleDishPlanningTurn,
  isSkipQuote,
  isStartPrep,
  isWantQuoteExplicit,
  type DishFlowResult,
} from "../agent/dish-flow.js";
import { runOrchestrator } from "../agent/orchestrator/execute.js";
import { gatePlanningRequest, isOffTopicByRules } from "../agent/planning-gate.js";
import { handlePlanningResetTurn } from "../agent/planning-reset.js";
import { detectReplyLang, pickCopy } from "../agent/reply-lang.js";
import { classifyConfirmIntent } from "../cooker/confirm-intent.js";
import { startPrepSession } from "../cooker/start-prep.js";
import { requireCooker, type AuthedRequest } from "../middleware/auth.js";
import {
  clearLastSuggestions,
  clearPendingStartPrep,
  getLastPlanningPantry,
  getLastReadyRunId,
  getPendingStartPrepRunId,
  getPlanningDraft,
  getRun,
  hasPendingReset,
  hasPendingStartPrep,
  markReadyForPrep,
  matchSuggestedDish,
  setLastPlanningPantry,
  setLastSuggestions,
} from "../store.js";
import { normalizePantryTags } from "../agent/tools/pantry.js";
import { summarizeRunObs } from "../agent/types.js";
import { AGENT_METADATA } from "../agent/erc8004-metadata.js";
import { env } from "../config.js";

export const agentRouter = Router();

/** ERC-8004 agentURI — public identity for 8004scan / integrators (no auth). */
agentRouter.get("/metadata.json", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(AGENT_METADATA);
});

function withObs<T extends Record<string, unknown>>(
  body: T,
  steps: import("../store.js").AgentStep[],
): T & { obs?: { llmCalls: number; parseFails: number } } {
  if (!env.LLM_TRACE) return body;
  const obs = summarizeRunObs(steps);
  return obs ? { ...body, obs } : body;
}
const runSchema = z.object({
  goal: z.string().min(1).max(500),
  pantry: z.array(z.string()).optional().default([]),
  selectedDish: z.string().min(1).max(120).optional(),
});

function sendPrep(
  res: import("express").Response,
  result: { session: import("../store.js").CookingSession; reply: string },
) {
  res.json({
    ok: true,
    status: "prep",
    message: result.reply,
    reply: result.reply,
    session: result.session,
    runId: result.session.runId,
  });
}

function sendRun(
  res: import("express").Response,
  run: import("../store.js").AgentRun,
  address?: string,
) {
  if (
    address &&
    (run.status === "cookable" || run.status === "quoted") &&
    run.plan
  ) {
    markReadyForPrep(address, run.id);
  }

  if (run.status === "no_merchant") {
    res.status(400).json(
      withObs(
        {
          ok: false,
          message: "no signed-in merchant has these items in stock",
          runId: run.id,
          status: run.status,
          intent: run.intent,
          steps: run.steps,
          plan: run.plan,
          missing: run.missing,
        },
        run.steps,
      ),
    );
    return;
  }

  if (run.status === "failed") {
    const lastErr = [...run.steps].reverse().find((s) => s.error)?.error;
    res.status(500).json(
      withObs(
        {
          ok: false,
          message: lastErr || "Agent run failed",
          runId: run.id,
          status: run.status,
          intent: run.intent,
          steps: run.steps,
        },
        run.steps,
      ),
    );
    return;
  }

  res.json(
    withObs(
      {
        ok: true,
        runId: run.id,
        status: run.status,
        intent: run.intent,
        steps: run.steps,
        plan: run.plan,
        missing: run.missing,
        suggestions: run.suggestions ?? [],
        quote: run.quote,
        substitutions: run.quote?.substitutions ?? [],
      },
      run.steps,
    ),
  );
}

function sendDishTurn(
  res: import("express").Response,
  dishTurn: DishFlowResult,
  address?: string,
) {
  if (dishTurn.type === "ask_bahan") {
    res.json({
      ok: true,
      status: "ask_bahan",
      message: dishTurn.message,
      dish: dishTurn.dish,
    });
    return;
  }
  if (dishTurn.type === "confirm_gap") {
    res.json({
      ok: true,
      status: "confirm_gap",
      message: dishTurn.message,
      dish: dishTurn.dish,
      plan: dishTurn.plan,
      missing: dishTurn.missing,
      userBahan: dishTurn.userBahan,
    });
    return;
  }
  if (dishTurn.type === "ask_quote") {
    res.json({
      ok: true,
      status: "ask_quote",
      message: dishTurn.message,
      dish: dishTurn.dish,
      plan: dishTurn.plan,
      missing: dishTurn.missing,
      userBahan: dishTurn.userBahan,
    });
    return;
  }
  if (dishTurn.type === "idle") {
    res.json({
      ok: true,
      status: "idle",
      message: dishTurn.message,
      dish: dishTurn.dish,
      plan: dishTurn.plan,
      missing: dishTurn.missing,
      userBahan: dishTurn.userBahan,
      runId: dishTurn.runId,
    });
    return;
  }
  if (dishTurn.type === "run") {
    sendRun(res, dishTurn.run, address);
    return;
  }
  res.status(500).json({ ok: false, message: "Unexpected dish turn" });
}

/**
 * Spoken mulai / ya after cookable → start prep (same as button).
 * Returns true if response was sent.
 */
async function tryStartPrepFromSpeech(
  res: import("express").Response,
  address: string,
  goal: string,
): Promise<boolean> {
  const pendingId = getPendingStartPrepRunId(address);
  const lastReadyId = getLastReadyRunId(address);
  const runId = pendingId || lastReadyId;
  if (!runId) return false;

  // Never steal an explicit quote / belanja sendiri / change-of-mind for prep
  if (isWantQuoteExplicit(goal) || isSkipQuote(goal)) return false;
  if (isOffTopicByRules(goal)) return false;

  // Prefer idle draft path: let dish-flow turn mulai into cookable then auto-start
  if (getPlanningDraft(address)?.phase === "idle" && isStartPrep(goal)) {
    return false;
  }

  // Idle with missing: dish-flow owns mau quote / mulai
  if (getPlanningDraft(address)?.phase === "idle") {
    return false;
  }

  let want = isStartPrep(goal);
  if (!want && hasPendingStartPrep(address)) {
    const confirm = await classifyConfirmIntent(goal, "generic");
    if (confirm === "yes") want = true;
    else if (confirm === "no") {
      clearPendingStartPrep(address);
      return false;
    }
  }
  if (!want) return false;

  const result = startPrepSession({ address, runId });
  if (!result.ok) return false;
  sendPrep(res, result);
  return true;
}

agentRouter.post("/runs", requireCooker, async (req: AuthedRequest, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, errors: parsed.error.flatten() });
    return;
  }

  const address = req.sessionAddress!;
  const lang = detectReplyLang(parsed.data.goal);
  const goal = parsed.data.goal;

  try {
    // batal / menu baru — before gate & dish-flow
    const reset = await handlePlanningResetTurn(address, goal);
    if (reset) {
      res.json({
        ok: true,
        status:
          reset.status === "reset_done" || reset.status === "reset_idle"
            ? "clarify"
            : "ask_reset",
        message: reset.message,
        reset: reset.status,
      });
      return;
    }

    // Spoken mulai / ya → start prep from last cookable (no orchestrator)
    if (await tryStartPrepFromSpeech(res, address, goal)) {
      return;
    }

    // Quoted → belanja sendiri: restore idle for same dish (no orchestrator)
    if (isSkipQuote(goal) && !getPlanningDraft(address)) {
      const abandoned = abandonQuotedForSelfBuy(address, goal);
      if (abandoned) {
        sendDishTurn(res, abandoned, address);
        return;
      }
    }

    let selectedDish = parsed.data.selectedDish?.trim() || undefined;

    // Chat/speak pick: match last suggestions without ask_bahan
    if (!selectedDish && !hasPendingReset(address)) {
      const matched = matchSuggestedDish(address, goal);
      if (matched) selectedDish = matched;
    }

    if (selectedDish) {
      clearLastSuggestions(address);
      const pantry = normalizePantryTags([
        ...parsed.data.pantry,
        ...getLastPlanningPantry(address),
      ]);
      const pick = await beginCommercePick({
        cookerAddress: address,
        dish: selectedDish,
        pantry,
        goal,
      });
      if (
        pick.type === "run" &&
        pick.run.status === "cookable" &&
        isStartPrep(goal)
      ) {
        const started = startPrepSession({ address, runId: pick.run.id });
        if (started.ok) {
          sendPrep(res, started);
          return;
        }
      }
      sendDishTurn(res, pick, address);
      return;
    }

    const activeDraft = getPlanningDraft(address);
    if (!activeDraft) {
      const gate = await gatePlanningRequest(goal);
      if (gate.kind !== "cooking_request") {
        res.json({
          ok: true,
          status: "clarify",
          message:
            gate.reply ||
            pickCopy(
              lang,
              "Mau mulai rencana masak baru?",
              "Want to start a new cooking plan?",
            ),
          gate: gate.kind,
        });
        return;
      }
    }

    const dishTurn = await handleDishPlanningTurn({
      cookerAddress: address,
      goal,
    });

    if (dishTurn.type !== "passthrough") {
      // Idle/confirm → cookable + spoken mulai → start prep immediately
      if (
        dishTurn.type === "run" &&
        (dishTurn.run.status === "cookable" ||
          dishTurn.run.status === "quoted") &&
        isStartPrep(goal)
      ) {
        const started = startPrepSession({
          address,
          runId: dishTurn.run.id,
        });
        if (started.ok) {
          sendPrep(res, started);
          return;
        }
      }
      sendDishTurn(res, dishTurn, address);
      return;
    }

    const run = await runOrchestrator(parsed.data);
    if (run.status === "suggestions" && run.suggestions?.length) {
      setLastSuggestions(
        address,
        run.suggestions.map((s) => s.dish),
      );
      if (run.pantry?.length) {
        setLastPlanningPantry(address, run.pantry);
      }
    }
    if (
      (run.status === "cookable" || run.status === "quoted") &&
      isStartPrep(goal)
    ) {
      const started = startPrepSession({ address, runId: run.id });
      if (started.ok) {
        sendPrep(res, started);
        return;
      }
    }
    sendRun(res, run, address);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent run failed";
    console.error("[agent] run failed:", err);
    res.status(500).json({ ok: false, message });
  }
});

agentRouter.get("/runs/:id", (req, res) => {
  const run = getRun(req.params.id);
  if (!run) {
    res.status(404).json({ ok: false, message: "Run not found" });
    return;
  }
  res.json(withObs({ ok: true, run }, run.steps));
});
