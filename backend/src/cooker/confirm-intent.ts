import { z } from "zod";
import { hasOllamaKey, ollamaChat } from "../agent/llm/client.js";
import { parseLlmJson } from "../agent/llm/json.js";

export type ConfirmIntent = "yes" | "no" | "unclear";

export type ConfirmContext =
  | "confirm_gap"
  | "ask_quote"
  | "abandon_replan"
  | "generic";

const confirmSchema = z.object({
  intent: z.enum(["yes", "no", "unclear"]),
});

/** ASR/chat-friendly normalize for short confirms. */
export function normalizeConfirmText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.…,!?？！。、;:"""''`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAffirmative(raw: string): boolean {
  const t = normalizeConfirmText(raw);
  if (!t) return false;
  return (
    /^(ya+|y+|yes|iya+h?|iy+a+|betul|benar|ok+|oke+|okay|setuju|sip|yoi|yup|yeah)$/.test(
      t,
    ) ||
    /^(ya|iya|yes|ok|oke)\s+(sudah|udah|benar|betul|dong|deh|aja|lah)$/.test(
      t,
    ) ||
    /^(benar semua|ya sudah|iya dong|iya deh|ok deh)$/.test(t)
  );
}

export function isNegative(raw: string): boolean {
  const t = normalizeConfirmText(raw);
  if (!t) return false;
  return (
    /^(tidak|tdk|nggak|nga+k|gak|enggak|ndak|no+|salah|bukan|jangan)$/.test(
      t,
    ) ||
    /^(tidak|nggak|gak|enggak)\s+(jadi|usah|dong|deh|lah|aja)?$/.test(t) ||
    /\b(tidak|nggak|gak|salah|bukan)\b/.test(t)
  );
}

export function classifyConfirmRules(raw: string): ConfirmIntent {
  if (isAffirmative(raw)) return "yes";
  if (isNegative(raw)) return "no";
  return "unclear";
}

async function classifyConfirmLlm(
  text: string,
  context: ConfirmContext,
): Promise<ConfirmIntent> {
  if (!hasOllamaKey()) return "unclear";
  try {
    const content = await ollamaChat({
      label: "confirm_intent",
      temperature: 0,
      system: `Classify a short Indonesian/English confirmation utterance (often from speech recognition).
Return ONLY JSON: {"intent":"yes"|"no"|"unclear"}

Context phase: ${context}
- yes: user agrees / confirms / wants to proceed (ya, iya, betul, ok, mau, setuju)
- no: user rejects / declines / wants to redo (tidak, nggak, salah, belanja sendiri when declining a quote offer)
- unclear: cannot tell

Do NOT invent shopping, payment, or new recipes — only yes/no/unclear.`,
      user: text,
    });
    return parseLlmJson(content, confirmSchema).intent;
  } catch (err) {
    console.warn("[cooker] confirm_intent LLM failed → unclear", err);
    return "unclear";
  }
}

/**
 * Rules first, then light LLM when unclear. Never invents money actions.
 */
export async function classifyConfirmIntent(
  text: string,
  context: ConfirmContext = "generic",
): Promise<ConfirmIntent> {
  const fromRules = classifyConfirmRules(text);
  if (fromRules !== "unclear") return fromRules;
  return classifyConfirmLlm(text, context);
}
