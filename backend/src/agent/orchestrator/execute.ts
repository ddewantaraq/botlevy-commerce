import type { AgentRun } from "../../store.js";
import { newId, saveRun } from "../../store.js";
import { classifyIntent } from "../subagents/classify-intent.js";
import { runGapAgent } from "../subagents/gap-agent.js";
import { runMenuAgent } from "../subagents/menu-agent.js";
import { runMerchantAgent } from "../subagents/merchant-agent.js";
import { runPantryAgent } from "../subagents/pantry-agent.js";
import { runRecipeAgent } from "../subagents/recipe-agent.js";
import { normalizePantryTags } from "../tools/pantry.js";
import type { OrchestratorContext, OrchestratorInput, RunStatus } from "../types.js";
import { stagesFor } from "./machine.js";

function toAgentRun(ctx: OrchestratorContext, id: string, createdAt: string): AgentRun {
  return {
    id,
    goal: ctx.goal,
    pantry: ctx.pantry,
    steps: ctx.steps,
    intent: ctx.intent,
    status: ctx.status ?? "failed",
    suggestions: ctx.suggestions,
    selectedDish: ctx.selectedDish,
    plan: ctx.plan,
    missing: ctx.missing,
    quote: ctx.quote,
    createdAt,
  };
}

/**
 * Hybrid orchestrator: deterministic stages + LLM sub-agents.
 * Always returns a saved AgentRun (never throws for cookable / suggestions / no_merchant).
 */
export async function runOrchestrator(
  input: OrchestratorInput,
): Promise<AgentRun> {
  const id = newId("run");
  const createdAt = new Date().toISOString();
  const ctx: OrchestratorContext = {
    goal: input.goal,
    selectedDish: input.selectedDish?.trim() || undefined,
    pantry: normalizePantryTags(input.pantry ?? []),
    steps: [],
  };

  try {
    const intent = await classifyIntent(ctx);
    const stages = stagesFor({ intent, selectedDish: ctx.selectedDish });

    for (const stage of stages) {
      if (stage === "classify" || stage === "done") continue;

      if (stage === "pantry_normalize") {
        await runPantryAgent(ctx);
        continue;
      }

      if (stage === "menu_suggest") {
        await runMenuAgent(ctx);
        ctx.status = "suggestions";
        return saveRun(toAgentRun(ctx, id, createdAt));
      }

      if (stage === "plan_recipe") {
        await runRecipeAgent(ctx);
        continue;
      }

      if (stage === "diff_pantry") {
        const missing = runGapAgent(ctx);
        if (missing.length === 0) {
          ctx.status = "cookable";
          return saveRun(toAgentRun(ctx, id, createdAt));
        }
        continue;
      }

      if (stage === "match_and_quote") {
        const result = runMerchantAgent(ctx);
        if (result.ok) {
          ctx.status = "quoted";
          return saveRun(toAgentRun(ctx, id, createdAt));
        }
        const status: RunStatus =
          result.reason === "no_merchant" ? "no_merchant" : "failed";
        ctx.status = status;
        return saveRun(toAgentRun(ctx, id, createdAt));
      }
    }

    ctx.status = "failed";
    return saveRun(toAgentRun(ctx, id, createdAt));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.steps.push({
      tool: "orchestrator",
      error: message,
      at: new Date().toISOString(),
    });
    ctx.status = "failed";
    return saveRun(toAgentRun(ctx, id, createdAt));
  }
}
