import { z } from "zod";
import { hasOllamaKey, ollamaChat } from "../agent/llm/client.js";
import { parseLlmJson } from "../agent/llm/json.js";

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

function normalize(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.…,!?？！。、;:"""''`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyPlanningRules(goal: string): PlanningGateKind | null {
  const t = normalize(goal);
  if (!t) return "off_topic";

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

  // Clearly non-cooking chatter
  if (
    /^(halo|hai|hi|hello|thanks|terima kasih|makasih)$/.test(t) ||
    /\b(cuaca|weather|berita|news|politik|harga btc|bitcoin)\b/.test(t)
  ) {
    return "off_topic";
  }

  return null;
}

async function classifyPlanningLlm(goal: string): Promise<PlanningGateKind> {
  if (!hasOllamaKey()) return "cooking_request";
  try {
    const content = await ollamaChat({
      label: "planning_gate",
      temperature: 0,
      system: `Classify a free-form chat before a cooking recipe planner runs.
Return ONLY JSON: {"kind":"cooking_request"|"stop"|"off_topic"|"save_without_session"}

- cooking_request: user wants a dish, recipe, ingredients shopping, or pantry-based suggestions
- stop: user wants to stop / cancel / not continue
- off_topic: clearly unrelated to cooking (weather, greetings-only, random chat)
- save_without_session: user asks to save a menu but there is no active cook session

When unsure between cooking_request and off_topic, prefer cooking_request.`,
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
  return { kind: "off_topic", reply: CONFIRM_COOKING };
}
