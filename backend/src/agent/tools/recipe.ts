import { z } from "zod";
import { AYAM_SEMUR_FALLBACK } from "../../seed.js";
import { hasOllamaKey, ollamaChat } from "../llm/client.js";
import { parseLlmJson } from "../llm/json.js";
import type { Plan } from "../types.js";

export const recipeSchema = z.object({
  dish: z.string(),
  steps: z.array(z.string()).min(1),
  ingredients: z
    .array(
      z.object({
        tag: z.string(),
        name: z.string(),
        qty: z.number(),
        unit: z.string(),
      }),
    )
    .min(1),
});

export type PlanResult = z.infer<typeof recipeSchema>;

export async function toolPlanRecipe(goal: string): Promise<{
  plan: Plan;
  source: "ollama" | "fallback";
}> {
  if (!hasOllamaKey()) {
    console.warn("[agent] plan_recipe: OLLAMA_API_KEY empty → fallback");
    return { plan: AYAM_SEMUR_FALLBACK, source: "fallback" };
  }

  try {
    const content = await ollamaChat({
      label: "plan_recipe",
      system: `You are a cooking commerce agent tool. Return ONLY JSON:
{"dish":string,"steps":string[],"ingredients":[{"tag":string,"name":string,"qty":number,"unit":string}]}
Use snake_case tags like chicken, shallot, kecap_manis, nutmeg, potato, cooking_oil, salt, beef, garlic, onion.
Prefer Indonesian home-cooking when the goal mentions Indonesian food.`,
      user: goal,
    });
    const parsed = parseLlmJson(content, recipeSchema);
    console.log("[agent] plan_recipe: ollama ok", {
      dish: parsed.dish,
      ingredientTags: parsed.ingredients.map((i) => i.tag),
    });
    return { plan: parsed, source: "ollama" };
  } catch (err) {
    console.warn("[agent] plan_recipe fallback:", err);
    return { plan: AYAM_SEMUR_FALLBACK, source: "fallback" };
  }
}
