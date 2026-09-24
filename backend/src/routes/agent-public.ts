/**
 * Unauthenticated x402-style public agent runs.
 * SIWE POST /agent/runs stays free and unchanged.
 */
import { Router } from "express";
import { z } from "zod";
import { runCommerceAgent } from "../agent/run.js";
import { summarizeRunObs } from "../agent/types.js";
import {
  env,
  MOCK_USDC_DECIMALS,
} from "../config.js";
import { publicAgentLimiter } from "../middleware/rate-limit.js";
import { verifyMockUsdcTransfer } from "../payments/verify.js";
import { claimPaymentTx } from "../store.js";

export const agentPublicRouter = Router();

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;
const PAYTO_RE = /^0x[a-fA-F0-9]{40}$/;

const runSchema = z.object({
  goal: z.string().min(1).max(500),
  pantry: z.array(z.string()).optional().default([]),
  selectedDish: z.string().min(1).max(120).optional(),
});

function acceptsBody() {
  return {
    scheme: "exact-transfer",
    network: `eip155:${env.CHAIN_ID}`,
    chainId: env.CHAIN_ID,
    token: env.MOCK_USDC_ADDRESS,
    payTo: env.X402_PAYTO,
    amount: String(env.X402_PRICE),
    decimals: MOCK_USDC_DECIMALS,
  };
}

function paymentRequired(
  res: import("express").Response,
  extra?: { message?: string },
) {
  res.status(402).json({
    ok: false,
    error: "payment_required",
    ...(extra?.message ? { message: extra.message } : {}),
    accepts: acceptsBody(),
  });
}

function x402Configured(): { ok: true } | { ok: false; reason: string } {
  if (!env.X402_ENABLED) {
    return { ok: false, reason: "X402_ENABLED is not true" };
  }
  if (!env.MOCK_USDC_ADDRESS?.trim()) {
    return { ok: false, reason: "MOCK_USDC_ADDRESS is not configured" };
  }
  if (!PAYTO_RE.test(env.X402_PAYTO.trim())) {
    return { ok: false, reason: "X402_PAYTO is missing or invalid" };
  }
  if (!Number.isFinite(env.X402_PRICE) || env.X402_PRICE <= 0) {
    return { ok: false, reason: "X402_PRICE is invalid" };
  }
  return { ok: true };
}

function publicSteps(
  steps: import("../store.js").AgentStep[],
): Array<{ tool: string; error?: string }> {
  return steps.map((s) => ({
    tool: s.tool,
    ...(s.error ? { error: s.error } : {}),
  }));
}

agentPublicRouter.post(
  "/public/runs",
  publicAgentLimiter,
  async (req, res) => {
    const cfg = x402Configured();
    if (!cfg.ok) {
      res.status(503).json({
        ok: false,
        error: "x402_unavailable",
        message: cfg.reason,
      });
      return;
    }

    const proofRaw = req.get("x-payment-tx")?.trim() ?? "";
    if (!proofRaw || !TX_HASH_RE.test(proofRaw)) {
      paymentRequired(res, {
        message: proofRaw
          ? "X-PAYMENT-TX must be a 32-byte hex tx hash"
          : undefined,
      });
      return;
    }

    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, errors: parsed.error.flatten() });
      return;
    }

    const payTo = env.X402_PAYTO.trim();
    const check = await verifyMockUsdcTransfer({
      txHash: proofRaw,
      expectedTo: payTo,
      expectedAmount: env.X402_PRICE,
    });
    if (!check.ok) {
      paymentRequired(res, { message: check.message });
      return;
    }

    if (!claimPaymentTx(proofRaw)) {
      res.status(409).json({
        ok: false,
        error: "payment_replay",
        message: "This payment tx was already used for a public run",
      });
      return;
    }

    try {
      const run = await runCommerceAgent({
        goal: parsed.data.goal,
        pantry: parsed.data.pantry,
        selectedDish: parsed.data.selectedDish,
      });

      const steps = env.LLM_TRACE
        ? run.steps
        : publicSteps(run.steps);

      const body: Record<string, unknown> = {
        ok: true,
        runId: run.id,
        status: run.status,
        intent: run.intent,
        steps,
        suggestions: run.suggestions ?? [],
        plan: run.plan,
        quote: run.quote,
        missing: run.missing,
        message: run.status === "failed"
          ? [...run.steps].reverse().find((s) => s.error)?.error ||
            "Agent run failed"
          : undefined,
      };

      if (env.LLM_TRACE) {
        const obs = summarizeRunObs(run.steps);
        if (obs) body.obs = obs;
      }

      if (run.status === "failed") {
        res.status(500).json({ ...body, ok: false });
        return;
      }
      if (run.status === "no_merchant") {
        res.status(400).json({
          ...body,
          ok: false,
          message: "no signed-in merchant has these items in stock",
        });
        return;
      }

      res.json(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Agent run failed";
      console.error("[agent/public] run failed:", err);
      res.status(500).json({ ok: false, message });
    }
  },
);
