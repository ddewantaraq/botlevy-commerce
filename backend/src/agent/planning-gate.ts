import { z } from "zod";
import { hasOllamaKey, ollamaChat } from "../agent/llm/client.js";
import { parseLlmJson } from "../agent/llm/json.js";
import { DISH_CUE_RE } from "./subagents/classify-intent.js";

export type PlanningGateKind =
  | "cooking_request"
  | "stop"
  | "off_topic"
  | "save_without_session";

export type PlanningGateResult = {
  kind: PlanningGateKind;
  reply?: string;
};

const gateSchema = z.object({
  kind: z.enum([
    "cooking_request",
    "stop",
    "off_topic",
    "save_without_session",
  ]),
});

const CONFIRM_COOKING =
  "Ini belum permintaan masak yang jelas. Mau mulai rencana masak baru? Ceritakan menu atau bahan yang ada.";

const CONFIRM_STOP =
  "Oke — tidak lanjut ke resep dulu. Kalau mau masak, ceritakan menu atau bahanmu ya.";

const SAVE_NO_SESSION =
  "Belum ada sesi masak aktif untuk disimpan. Mulai masak dulu, lalu bilang **simpan menu** setelah selesai.";

const OFF_TOPIC_MOOD =
  "Oke — belum kedengarannya mau masak. Sebut **menu** (mis. soto ayam) atau **bahan** yang ada ya.";

function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.…,!?？！。、;:"""''`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Collapse repeated letters for slang match (magerrr → mager). */
function collapseRepeats(t: string): string {
  return t.replace(/(.)\1{2,}/g, "$1$1");
}

const MOOD_SLANG_RE =
  /^(mager+|males+|malas+|capek+|lelah+|bosan+|ngantuk+|pusing+|stress+|stres+|gabut+|bete+|pegel+|pegell+)$/i;

const COOK_VOCAB_RE =
  /\b(masak|cook|resep|recipe|bahan|menu|makan|makanan|pantry|quote|warung|ayam|sapi|ikan|nasi|soto|semur|rendang|tumis|goreng|sop|sup|mie|bakso)\b/i;

function looksGibberish(t: string): boolean {
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length !== 1) return false;
  const w = tokens[0]!;
  if (w.length < 3 || w.length > 24) return w.length > 24;
  if (DISH_CUE_RE.test(w) || COOK_VOCAB_RE.test(w)) return false;
  // Heavy repetition: magerrrr, asdfasdf
  if (/(.)\1{2,}/.test(w)) return true;
  // No vowel (latin) — likely nonsense
  if (!/[aeiou]/i.test(w) && w.length >= 4) return true;
  return false;
}

function classifyPlanningRules(goal: string): PlanningGateKind | null {
  const t = normalize(goal);
  if (!t) return "off_topic";

  const collapsed = collapseRepeats(t.replace(/\s+/g, ""));

  if (
    /^(stop|berhenti|batal|cancel|gak jadi|tidak jadi|udah ah)$/.test(t) ||
    /\b(stop|berhenti chat|batal aja|cancel)\b/.test(t)
  ) {
    return "stop";
  }

  if (
    /\b(simpan(\s+menu(nya)?)?|save(\s+menu)?)\b/.test(t) &&
    !/\b(masak|cook|resep|bahan|menu\s+apa)\b/.test(t)
  ) {
    return "save_without_session";
  }

  // Mood / laziness slang (mager, magerrr, males, …)
  if (MOOD_SLANG_RE.test(t) || MOOD_SLANG_RE.test(collapsed)) {
    return "off_topic";
  }
  if (
    /^(mager|males|malas|capek|lelah|bosan|ngantuk|bete|gabut)/i.test(collapsed)
  ) {
    return "off_topic";
  }

  // Clearly non-cooking chatter
  if (
    /^(halo|hai|hi|hello|thanks|terima kasih|makasih)$/.test(t) ||
    /\b(cuaca|weather|berita|news|politik|harga btc|bitcoin)\b/.test(t)
  ) {
    return "off_topic";
  }

  if (looksGibberish(t)) {
    return "off_topic";
  }

  // Clear dish / cook cues → cooking request (skip LLM)
  if (DISH_CUE_RE.test(t) || /\b(masak|cook|resep|recipe|bahan|enak\s+apa)\b/i.test(t)) {
    return "cooking_request";
  }

  return null;
}

/** Sync rule check — mood/gibberish/chatter must never advance planning. */
export function isOffTopicByRules(goal: string): boolean {
  return classifyPlanningRules(goal) === "off_topic";
}

/**
 * Off-topic for mid-flow: rules first; optional LLM when short & no cook cues.
 * Does not treat stop/batal as off-topic (those have their own handlers).
 */
export async function isOffTopicUtterance(goal: string): Promise<boolean> {
  const fromRules = classifyPlanningRules(goal);
  if (fromRules === "off_topic") return true;
  if (fromRules === "cooking_request") return false;
  if (fromRules === "stop" || fromRules === "save_without_session") return false;

  const t = normalize(goal);
  const tokens = t.split(/\s+/).filter(Boolean);
  // Only ask LLM for short ambiguous phrases without food cues
  if (tokens.length > 6 || DISH_CUE_RE.test(t) || COOK_VOCAB_RE.test(t)) {
    return false;
  }
  if (!hasOllamaKey()) return false;
  try {
    const kind = await classifyPlanningLlm(goal);
    return kind === "off_topic";
  } catch {
    return false;
  }
}

export { OFF_TOPIC_MOOD, CONFIRM_COOKING };

async function classifyPlanningLlm(goal: string): Promise<PlanningGateKind> {
  if (!hasOllamaKey()) return "cooking_request";
  try {
    const { content } = await ollamaChat({
      label: "planning_gate",
      temperature: 0,
      system: `Classify a free-form chat before a cooking recipe planner runs.
Return ONLY JSON: {"kind":"cooking_request"|"stop"|"off_topic"|"save_without_session"}

- cooking_request: user wants a real dish, recipe, ingredients shopping, or pantry-based suggestions (names a food or lists ingredients)
- stop: user wants to stop / cancel / not continue
- off_topic: unrelated to cooking — greetings-only, weather, slang about being lazy/tired (mager, males, capek), nonsense/gibberish/random strings, jokes with no food intent
- save_without_session: user asks to save a menu but there is no active cook session

NEVER classify mood slang, gibberish, or random keyboard mash as cooking_request.
When unsure between cooking_request and off_topic, prefer off_topic unless there is a clear food/dish/ingredient cue.`,
      user: goal,
    });
    return parseLlmJson(content, gateSchema).kind;
  } catch (err) {
    console.warn("[agent] planning_gate LLM failed → cooking_request", err);
    return "cooking_request";
  }
}

/**
 * Thin pre-classify before full orchestrator — blocks stop/off-topic from plan_recipe.
 */
export async function gatePlanningRequest(
  goal: string,
): Promise<PlanningGateResult> {
  const fromRules = classifyPlanningRules(goal);
  const kind = fromRules ?? (await classifyPlanningLlm(goal));

  if (kind === "cooking_request") {
    return { kind };
  }
  if (kind === "stop") {
    return { kind, reply: CONFIRM_STOP };
  }
  if (kind === "save_without_session") {
    return { kind, reply: SAVE_NO_SESSION };
  }
  const t = normalize(goal);
  const collapsed = collapseRepeats(t.replace(/\s+/g, ""));
  const mood =
    MOOD_SLANG_RE.test(t) ||
    MOOD_SLANG_RE.test(collapsed) ||
    /^(mager|males|malas|capek|lelah|bosan)/i.test(collapsed) ||
    looksGibberish(t);
  return {
    kind: "off_topic",
    reply: mood ? OFF_TOPIC_MOOD : CONFIRM_COOKING,
  };
}
