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
  | "prep_walk"
  | "prep_free"
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
    "prep_walk",
    "prep_free",
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
  /** When prep and "ask", LLM may return prep_walk / prep_free. */
  prepGuide?: "ask" | "walk" | "free";
}): Promise<CookIntent> {
  if (!hasOllamaKey()) return "unclear";
  try {
    const modeAskHint =
      opts.phase === "prep" && (opts.prepGuide ?? "ask") === "ask"
        ? `
Prep mode-ask is pending (user has not chosen yet):
- prep_walk: check ingredients one-by-one / guided (satu-satu, sebut bahan pelan-pelan, cek satu per satu, one by one)
- prep_free: skip guided walk — checklist or skip ahead (langsung, skip, gak usah satu-satu, bebas)
Prefer prep_walk / prep_free over unclear when the utterance clearly chooses a prep style.
Prefer start when they want to begin cooking now (mulai masak).`
        : opts.phase === "prep" && opts.prepGuide === "free"
          ? `
Prep free checklist mode (user already chose langsung):
- repeat: re-list / re-speak all ingredients (ulang sebutin bahan, list ingredients again, what do I need)
- prep_walk: switch to one-by-one guide (satu-satu, cek satu per satu)
Prefer repeat or prep_walk over unclear for those asks. Prefer start for mulai masak.
Do NOT return prep_free again.`
          : `
Do NOT return prep_walk or prep_free unless phase is prep and mode-ask is pending (or free→walk switch); use unclear instead.`;

    const content = await ollamaChat({
      label: "cook_intent",
      temperature: 0,
      system: `You classify short Indonesian/English kitchen-assistant utterances during meal prep, cooking, or post-cook wrap-up.
Return ONLY JSON: {"intent":"next"|"back"|"repeat"|"done"|"start"|"all_ready"|"prep_walk"|"prep_free"|"escape"|"save"|"stop"|"off_topic"|"unclear"}

Meanings:
- next: go to next cooking step or next prep ingredient (lanjut, next, lanjutkan)
- back: previous step (balik, sebelumnya, previous)
- repeat: re-read current cook step OR (in prep free) re-list all ingredients
- done: finish cooking session / last step wrap-up (selesai, beres)
- start: begin cooking from prep (mulai masak, start cooking)
- all_ready: all ingredients ready (semua siap)
- prep_walk: one-by-one ingredient guide (mode-ask choice, or switch from free checklist)
- prep_free: skip one-by-one guide (checklist / langsung) during prep mode-ask only
- save: save this dish to menus (simpan menu, save menu, ya simpan)
- stop: end session without saving / quit cooking (stop, berhenti, akhiri)
- escape: change menu / cancel cooking / replan (ganti menu, batal)
- off_topic: clearly unrelated to this cook session (weather, news, random chat)
- unclear: ambiguous cook/prep utterance that is not a clear navigation command
${modeAskHint}

If both back and repeat could apply, prefer back when they say sebelumnya/previous step; prefer repeat when they say ulang/baca lagi current step.
In post_cook phase, prefer save/stop/off_topic over next/back/repeat.`,
      user: `Phase: ${opts.phase}
Dish: ${opts.dish}
Step: ${opts.stepIndex + 1}/${opts.stepTotal}
PrepGuide: ${opts.prepGuide ?? "n/a"}
Utterance: ${opts.text}`,
    });
    return parseLlmJson(content, intentSchema).intent;
  } catch (err) {
    console.warn("[cooker] cook_intent LLM failed → unclear", err);
    return "unclear";
  }
}
