import { z } from "zod";
import { hasOllamaKey, ollamaChat } from "../agent/llm/client.js";
import { parseLlmJson } from "../agent/llm/json.js";

export type CookIntent =
  | "next"
  | "back"
  | "repeat"
  | "done"
  | "start"
  | "all_ready"
  | "escape"
  | "save"
  | "stop"
  | "off_topic"
  | "unclear";

export type CookPhase = "prep" | "cooking" | "post_cook";

const intentSchema = z.object({
  intent: z.enum([
    "next",
    "back",
    "repeat",
    "done",
    "start",
    "all_ready",
    "escape",
    "save",
    "stop",
    "off_topic",
    "unclear",
  ]),
});

/**
 * Light LLM classify for natural cook/prep phrases.
 * Returns unclear on missing key / parse failure — never invents money actions.
 */
export async function classifyCookIntent(opts: {
  text: string;
  phase: CookPhase;
  dish: string;
  stepIndex: number;
  stepTotal: number;
}): Promise<CookIntent> {
  if (!hasOllamaKey()) return "unclear";
  try {
    const content = await ollamaChat({
      label: "cook_intent",
      temperature: 0,
      system: `You classify short Indonesian/English kitchen-assistant utterances during meal prep, cooking, or post-cook wrap-up.
Return ONLY JSON: {"intent":"next"|"back"|"repeat"|"done"|"start"|"all_ready"|"escape"|"save"|"stop"|"off_topic"|"unclear"}

Meanings:
- next: go to next cooking step (lanjut, next, lanjutkan)
- back: previous step (balik, sebelumnya, previous)
- repeat: re-read current step (ulang, ulangi, baca lagi) — NOT go back
- done: finish cooking session / last step wrap-up (selesai, beres)
- start: begin cooking from prep (mulai masak, start cooking)
- all_ready: all ingredients ready (semua siap)
- save: save this dish to menus (simpan menu, save menu, ya simpan)
- stop: end session without saving / quit cooking (stop, berhenti, akhiri)
- escape: change menu / cancel cooking / replan (ganti menu, batal)
- off_topic: clearly unrelated to this cook session (weather, news, random chat)
- unclear: ambiguous cook/prep utterance that is not a clear navigation command

If both back and repeat could apply, prefer back when they say sebelumnya/previous step; prefer repeat when they say ulang/baca lagi current step.
In post_cook phase, prefer save/stop/off_topic over next/back/repeat.`,
      user: `Phase: ${opts.phase}
Dish: ${opts.dish}
Step: ${opts.stepIndex + 1}/${opts.stepTotal}
Utterance: ${opts.text}`,
    });
    return parseLlmJson(content, intentSchema).intent;
  } catch (err) {
    console.warn("[cooker] cook_intent LLM failed → unclear", err);
    return "unclear";
  }
}
