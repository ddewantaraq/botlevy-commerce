import { toolDiffPantry } from "../tools/pantry.js";
import type { OrchestratorContext } from "../types.js";
import { appendStep } from "../types.js";
import type { Ingredient } from "../../store.js";

export function runGapAgent(ctx: OrchestratorContext): Ingredient[] {
  if (!ctx.plan) {
    appendStep(ctx, "diff_pantry", { pantry: ctx.pantry }, undefined, "No plan");
    return [];
  }
  const missing = toolDiffPantry(ctx.plan.ingredients, ctx.pantry);
  appendStep(ctx, "diff_pantry", { pantry: ctx.pantry }, {
    missingCount: missing.length,
    missing,
  });
  ctx.missing = missing;
  return missing;
}
