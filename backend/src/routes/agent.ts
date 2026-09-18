import { Router } from "express";
import { z } from "zod";
import { handleDishPlanningTurn } from "../agent/dish-flow.js";
import { runOrchestrator } from "../agent/orchestrator/execute.js";
import { gatePlanningRequest } from "../agent/planning-gate.js";
import { requireCooker, type AuthedRequest } from "../middleware/auth.js";
import { clearPlanningDraft, getPlanningDraft, getRun } from "../store.js";

export const agentRouter = Router();

const runSchema = z.object({
  goal: z.string().min(1).max(500),
  pantry: z.array(z.string()).optional().default([]),
  selectedDish: z.string().min(1).max(120).optional(),
});

function sendRun(
  res: import("express").Response,
  run: import("../store.js").AgentRun,
) {
  if (run.status === "no_merchant") {
    res.status(400).json({
      ok: false,
      message: "no signed-in merchant has these items in stock",
      runId: run.id,
      status: run.status,
      intent: run.intent,
      steps: run.steps,
      plan: run.plan,
      missing: run.missing,
    });
    return;
  }

  if (run.status === "failed") {
    const lastErr = [...run.steps].reverse().find((s) => s.error)?.error;
    res.status(500).json({
      ok: false,
      message: lastErr || "Agent run failed",
      runId: run.id,
      status: run.status,
      intent: run.intent,
      steps: run.steps,
    });
    return;
  }

  res.json({
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
  });
}

agentRouter.post("/runs", requireCooker, async (req: AuthedRequest, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, errors: parsed.error.flatten() });
    return;
  }

  const address = req.sessionAddress!;

  try {
    // Explicit dish pick always goes through orchestrator (no ask_bahan)
    if (!parsed.data.selectedDish?.trim()) {
      const activeDraft = getPlanningDraft(address);
      // Skip gate while mid dish→bahan→confirm (short "ya"/"tidak" answers)
      if (!activeDraft) {
        const gate = await gatePlanningRequest(parsed.data.goal);
        if (gate.kind !== "cooking_request") {
          res.json({
            ok: true,
            status: "clarify",
            message: gate.reply,
            gate: gate.kind,
          });
          return;
        }
      }

      const dishTurn = await handleDishPlanningTurn({
        cookerAddress: address,
        goal: parsed.data.goal,
      });

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

      if (dishTurn.type === "run") {
        sendRun(res, dishTurn.run);
        return;
      }
      // passthrough → orchestrator
    } else {
      clearPlanningDraft(address);
    }

    const run = await runOrchestrator(parsed.data);
    sendRun(res, run);
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
  res.json({ ok: true, run });
});
