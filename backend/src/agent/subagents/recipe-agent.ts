import { toolPlanRecipe, RECIPE_TRY_AGAIN } from "../tools/recipe.js";
import type { OrchestratorContext, Plan } from "../types.js";
import { appendStep } from "../types.js";
import type { LlmStepPayload } from "../llm/client.js";

export async function runRecipeAgent(
  ctx: OrchestratorContext,
): Promise<Plan> {
  const dishHint = ctx.selectedDish?.trim();
  const goal = dishHint
    ? `Plan a full home-cooking recipe for: ${dishHint}. User context: ${ctx.goal}`
    : ctx.goal;

  try {
    const planned = await toolPlanRecipe(goal);
    appendStep(
      ctx,
      "plan_recipe",
      { goal, selectedDish: dishHint },
      {
        source: planned.source,
        dish: planned.plan.dish,
        ingredientCount: planned.plan.ingredients.length,
      },
      undefined,
      planned.llm,
    );
    ctx.plan = planned.plan;
    return planned.plan;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : RECIPE_TRY_AGAIN;
    const llm =
      err && typeof err === "object" && "llm" in err
        ? (err as { llm?: LlmStepPayload }).llm
        : undefined;
    appendStep(
      ctx,
      "plan_recipe",
      { goal, selectedDish: dishHint },
      undefined,
      message,
      llm,
    );
    throw new Error(message);
  }
}
