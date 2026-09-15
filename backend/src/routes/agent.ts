import { Router } from "express";
import { z } from "zod";
import { runCommerceAgent } from "../agent/run.js";
import { requireCooker, type AuthedRequest } from "../middleware/auth.js";
import { getRun } from "../store.js";

export const agentRouter = Router();

const runSchema = z.object({
  goal: z.string().min(3).max(500),
  pantry: z.array(z.string()).optional().default([]),
});

agentRouter.post("/runs", requireCooker, async (req: AuthedRequest, res) => {
  const parsed = runSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, errors: parsed.error.flatten() });
    return;
  }

  try {
    const run = await runCommerceAgent(parsed.data);
    res.json({
      ok: true,
      runId: run.id,
      steps: run.steps,
      plan: run.plan,
      missing: run.missing,
      quote: run.quote,
      substitutions: run.quote?.substitutions ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent run failed";
    const client =
      message.includes("no signed-in merchant") ||
      message.includes("Nothing to buy") ||
      message.includes("not a real wallet");
    if (!client) console.error("[agent] run failed:", err);
    res.status(client ? 400 : 500).json({ ok: false, message });
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
