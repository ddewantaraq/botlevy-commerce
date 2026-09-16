import { z } from "zod";
import { hasOllamaKey, ollamaChat } from "../llm/client.js";
import { parseLlmJson } from "../llm/json.js";
import type { DishSuggestion, OrchestratorContext } from "../types.js";
import { appendStep } from "../types.js";

const suggestionsSchema = z.object({
  suggestions: z
    .array(
      z.object({
        dish: z.string(),
        reason: z.string(),
        ingredientsPreview: z.array(z.string()).optional(),
      }),
    )
    .min(1)
    .max(5),
});

const FALLBACK_SUGGESTIONS: DishSuggestion[] = [
  {
    dish: "Beef stir-fry (tumis daging)",
    reason: "Uses beef with simple pantry aromatics",
    ingredientsPreview: ["beef", "garlic", "onion", "salt", "cooking_oil"],
  },
  {
    dish: "Ayam goreng sederhana",
    reason: "Classic when chicken is available",
    ingredientsPreview: ["chicken", "garlic", "salt", "cooking_oil"],
  },
  {
    dish: "Telur dadar sayur",
    reason: "Fallback home dish with oil and salt",
    ingredientsPreview: ["egg", "salt", "cooking_oil"],
  },
];

function fallbackFromPantry(pantry: string[]): DishSuggestion[] {
  const tags = new Set(pantry.map((t) => t.toLowerCase()));
  if (tags.has("beef") || tags.has("daging_sapi")) {
    return [
      {
        dish: "Tumis daging sapi bawang",
        reason: "Matches beef in pantry",
        ingredientsPreview: ["beef", "garlic", "onion", "salt", "cooking_oil"],
      },
      {
        dish: "Beef pepper stir-fry",
        reason: "Simple beef + pantry spices",
        ingredientsPreview: ["beef", "pepper", "garlic", "butter"],
      },
      FALLBACK_SUGGESTIONS[2],
    ];
  }
  if (tags.has("chicken") || tags.has("ayam")) {
    return [
      {
        dish: "Ayam Semur",
        reason: "Uses chicken; buy gap from warung",
        ingredientsPreview: ["chicken", "shallot", "kecap_manis", "potato"],
      },
      ...FALLBACK_SUGGESTIONS.slice(1),
    ];
  }
  return FALLBACK_SUGGESTIONS;
}

export async function runMenuAgent(
  ctx: OrchestratorContext,
): Promise<DishSuggestion[]> {
  let suggestions: DishSuggestion[] = [];
  let source: "ollama" | "fallback" = "fallback";

  if (hasOllamaKey()) {
    try {
      const content = await ollamaChat({
        label: "menu_suggest",
        system: `Suggest 3-5 Indonesian/home-cook dishes from pantry tags. Return ONLY JSON:
{"suggestions":[{"dish":string,"reason":string,"ingredientsPreview":[string]}]}
Prefer dishes that use many of the pantry tags. ingredientsPreview = snake_case tags.`,
        user: `Pantry tags: ${ctx.pantry.join(", ") || "(empty)"}\nUser said: ${ctx.goal}`,
      });
      suggestions = parseLlmJson(content, suggestionsSchema).suggestions;
      source = "ollama";
    } catch (err) {
      console.warn("[agent] menu_suggest fallback:", err);
      suggestions = fallbackFromPantry(ctx.pantry);
    }
  } else {
    suggestions = fallbackFromPantry(ctx.pantry);
  }

  appendStep(ctx, "menu_suggest", { pantry: ctx.pantry }, {
    source,
    count: suggestions.length,
    dishes: suggestions.map((s) => s.dish),
  });
  ctx.suggestions = suggestions;
  return suggestions;
}
