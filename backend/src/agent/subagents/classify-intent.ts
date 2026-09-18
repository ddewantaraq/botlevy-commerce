import { z } from "zod";
import { hasOllamaKey, ollamaChat } from "../llm/client.js";
import { parseLlmJson } from "../llm/json.js";
import type { Intent, OrchestratorContext } from "../types.js";
import { appendStep } from "../types.js";

const intentSchema = z.object({
  intent: z.enum(["known_dish", "pantry_first", "open_goal"]),
});

export const PANTRY_FIRST_RE =
  /\b(enak\s+apa|masak\s+apa|what\s+can\s+i\s+cook|with\s+what\s+i\s+have|cuma\s+punya|cuman\s+punya|hanya\s+punya|only\s+have|bahan[- ]?bahan|dari\s+pantry|from\s+(my\s+)?pantry|recommend\s+(a\s+)?(menu|dish|meal)|enaknya\s+dimasak)\b/i;

const KNOWN_DISH_RE =
  /\b(masak|cook|buat|make|recipe\s+for)\b.+\b(ayam|semur|rendang|soto|nasi|steak|sop|soup|curry|gulai|tumis|goreng|bakar|mie|bakso)\b/i;

/** Indonesian / common dish cues for bare menu mentions like "soto ayam". */
const DISH_CUE_RE =
  /\b(soto|ayam|semur|rendang|nasi|steak|sop|soup|curry|gulai|tumis|goreng|bakar|mie|bakso|gado|pecel|rawon|opor|sate|capcay|sayur|sup|bubur|lodeh|rica|balado)\b/i;

/**
 * Short phrase that looks like a dish name (1–5 tokens), not pantry-first.
 */
export function looksLikeBareDish(goal: string): boolean {
  const g = goal.trim().replace(/[.…,!?]+$/g, "").trim();
  if (!g) return false;
  if (PANTRY_FIRST_RE.test(g)) return false;
  const tokens = g.split(/\s+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 5) return false;
  if (KNOWN_DISH_RE.test(g)) return true;
  return DISH_CUE_RE.test(g);
}

export function classifyIntentRules(goal: string): Intent | null {
  const g = goal.trim();
  if (!g) return "open_goal";
  if (PANTRY_FIRST_RE.test(g)) return "pantry_first";
  if (KNOWN_DISH_RE.test(g)) return "known_dish";
  if (looksLikeBareDish(g)) return "known_dish";
  return null;
}

async function classifyIntentLlm(goal: string): Promise<Intent> {
  if (!hasOllamaKey()) return "open_goal";
  try {
    const content = await ollamaChat({
      label: "classify_intent",
      system: `Classify a cooking request. Return ONLY JSON:
{"intent":"known_dish"|"pantry_first"|"open_goal"}
- pantry_first: user lists ingredients / asks what to cook from what they have
- known_dish: user names a specific dish (including bare names like "soto ayam")
- open_goal: other cooking goals`,
      user: goal,
    });
    return parseLlmJson(content, intentSchema).intent;
  } catch (err) {
    console.warn("[agent] classify_intent LLM failed → open_goal", err);
    return "open_goal";
  }
}

export async function classifyIntent(
  ctx: OrchestratorContext,
): Promise<Intent> {
  const fromRules = classifyIntentRules(ctx.goal);
  if (fromRules) {
    appendStep(ctx, "classify_intent", {
      goal: ctx.goal,
      selectedDish: ctx.selectedDish,
    }, {
      intent: fromRules,
      source: "rules",
    });
    ctx.intent = fromRules;
    return fromRules;
  }

  // Explicit dish pick without pantry-first wording → commerce path
  if (ctx.selectedDish?.trim()) {
    const intent: Intent = "known_dish";
    appendStep(ctx, "classify_intent", {
      goal: ctx.goal,
      selectedDish: ctx.selectedDish,
    }, {
      intent,
      source: "selected_dish",
    });
    ctx.intent = intent;
    return intent;
  }

  const intent = await classifyIntentLlm(ctx.goal);
  appendStep(ctx, "classify_intent", { goal: ctx.goal }, {
    intent,
    source: "ollama",
  });
  ctx.intent = intent;
  return intent;
}
