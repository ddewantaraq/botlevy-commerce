import { z } from "zod";
import { hasOllamaKey, ollamaChat, toStepLlm } from "../llm/client.js";
import { parseLlmJson } from "../llm/json.js";
import { normalizePantryTags, normalizeTag } from "../tools/pantry.js";
import type { OrchestratorContext } from "../types.js";
import { appendStep } from "../types.js";

const pantryNormSchema = z.object({
  tags: z.array(z.string()).min(0),
});

/** Merge request pantry chips with tags inferred from free-text goal. */
export async function runPantryAgent(
  ctx: OrchestratorContext,
): Promise<string[]> {
  const fromChips = normalizePantryTags(ctx.pantry);
  let fromGoal: string[] = [];
  let llm: ReturnType<typeof toStepLlm>;

  if (hasOllamaKey()) {
    try {
      const { content, meta } = await ollamaChat({
        label: "pantry_normalize",
        system: `Extract pantry ingredient tags from the user message. Return ONLY JSON:
{"tags":["snake_case",...]}
Use tags like beef, chicken, garlic, onion, shallot, salt, cooking_oil. Empty array if none.`,
        user: ctx.goal,
      });
      try {
        fromGoal = parseLlmJson(content, pantryNormSchema).tags.map(normalizeTag).filter(Boolean);
        llm = toStepLlm(meta, true);
      } catch {
        llm = toStepLlm(meta, false);
      }
    } catch (err) {
      console.warn("[agent] pantry_normalize LLM failed:", err);
    }
  }

  // Light heuristic extraction for common Bahasa/English words when LLM skipped
  if (fromGoal.length === 0) {
    const heuristics: Array<[RegExp, string]> = [
      [/\b(daging\s+sapi|beef)\b/i, "beef"],
      [/\b(daging\s+ayam|chicken|ayam)\b/i, "chicken"],
      [/\b(bawang\s+putih|garlic)\b/i, "garlic"],
      [/\b(bawang\s+merah|shallot)\b/i, "shallot"],
      [/\b(bawang\s+bombay|onion)\b/i, "onion"],
      [/\b(garam|salt)\b/i, "salt"],
      [/\b(minyak|cooking_oil|oil)\b/i, "cooking_oil"],
      [/\b(kentang|potato)\b/i, "potato"],
      [/\b(mentega|butter)\b/i, "butter"],
    ];
    for (const [re, tag] of heuristics) {
      if (re.test(ctx.goal)) fromGoal.push(tag);
    }
  }

  const merged = normalizePantryTags([...fromChips, ...fromGoal]);
  appendStep(
    ctx,
    "pantry_normalize",
    { chips: fromChips, goal: ctx.goal },
    {
      pantry: merged,
    },
    undefined,
    llm,
  );
  ctx.pantry = merged;
  return merged;
}
