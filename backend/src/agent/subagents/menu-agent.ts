import { z } from "zod";
import { hasOllamaKey, ollamaChat, toStepLlm } from "../llm/client.js";
import { parseLlmJson } from "../llm/json.js";
import type { DishSuggestion, OrchestratorContext } from "../types.js";
import { appendStep } from "../types.js";

export const MENU_TRY_AGAIN =
  "Maaf, gagal menyarankan menu. Coba chat atau bicara lagi.";

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

export async function runMenuAgent(
  ctx: OrchestratorContext,
): Promise<DishSuggestion[]> {
  if (!hasOllamaKey()) {
    appendStep(ctx, "menu_suggest", { pantry: ctx.pantry }, undefined, MENU_TRY_AGAIN);
    throw new Error(MENU_TRY_AGAIN);
  }

  try {
    const { content, meta } = await ollamaChat({
      label: "menu_suggest",
      system: `Suggest 3-5 Indonesian/home-cook dishes from pantry tags. Return ONLY JSON:
{"suggestions":[{"dish":string,"reason":string,"ingredientsPreview":[string]}]}
Prefer dishes that use many of the pantry tags. ingredientsPreview = snake_case tags.`,
      user: `Pantry tags: ${ctx.pantry.join(", ") || "(empty)"}\nUser said: ${ctx.goal}`,
    });
    try {
      const suggestions = parseLlmJson(content, suggestionsSchema).suggestions;
      appendStep(
        ctx,
        "menu_suggest",
        { pantry: ctx.pantry },
        {
          source: "ollama",
          count: suggestions.length,
          dishes: suggestions.map((s) => s.dish),
        },
        undefined,
        toStepLlm(meta, true),
      );
      ctx.suggestions = suggestions;
      return suggestions;
    } catch (parseErr) {
      appendStep(
        ctx,
        "menu_suggest",
        { pantry: ctx.pantry },
        undefined,
        MENU_TRY_AGAIN,
        toStepLlm(meta, false),
      );
      throw parseErr;
    }
  } catch (err) {
    const message = MENU_TRY_AGAIN;
    console.warn("[agent] menu_suggest failed:", err);
    if (!ctx.steps.some((s) => s.tool === "menu_suggest" && s.error)) {
      appendStep(ctx, "menu_suggest", { pantry: ctx.pantry }, undefined, message);
    }
    throw new Error(message);
  }
}
