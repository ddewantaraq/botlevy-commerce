import { toolPlanRecipe } from "../tools/recipe.js";
import type { OrchestratorContext, Plan } from "../types.js";
import { appendStep } from "../types.js";

export async function runRecipeAgent(
  ctx: OrchestratorContext,
): Promise<Plan> {
  const dishHint = ctx.selectedDish?.trim();
  const goal = dishHint
    ? `Plan a full home-cooking recipe for: ${dishHint}. User context: ${ctx.goal}`
    : ctx.goal;

  const planned = await toolPlanRecipe(goal);
  appendStep(ctx, "plan_recipe", { goal, selectedDish: dishHint }, {
    source: planned.source,
    dish: planned.plan.dish,
    ingredientCount: planned.plan.ingredients.length,
  });
  ctx.plan = planned.plan;
  return planned.plan;
}
