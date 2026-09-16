import { Router } from "express";
import { z } from "zod";
import { runOrchestrator } from "../agent/orchestrator/execute.js";
import { requireCooker, type AuthedRequest } from "../middleware/auth.js";
import { getRun } from "../store.js";

export const agentRouter = Router();

const runSchema = z.object({
  goal: z.string().min(3).max(500),
  pantry: z.array(z.string()).optional().default([]),
  selectedDish: z.string().min(1).max(120).optional(),
});

agentRouter.post("/runs", requireCooker, async (req: AuthedRequest, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, errors: parsed.error.flatten() });
    return;
  }

  try {
    const run = await runOrchestrator(parsed.data);

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
