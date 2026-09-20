import type { CookingSession } from "../store.js";
import { saveCookerMenu, saveCookingSession } from "../store.js";
import {
  classifyConfirmIntent,
  isAffirmative,
  isNegative,
} from "./confirm-intent.js";
import {
  classifyCookIntent,
  type CookIntent,
  type CookPhase,
} from "./cook-intent.js";
import { formatIngredientLabel } from "../units.js";

export type SessionMessageResult = {
  session: CookingSession;
  reply: string;
  cookStep?: { index: number; total: number; text: string };
  prepStep?: { index: number; total: number; tag: string; text: string };
  handoff?: { goal: string };
  speak?: string;
};

const CLARIFY_COOK =
  "Mau **lanjut** langkah ini, atau **ganti menu**? (bisa juga: balik, ulang, selesai)";

const CLARIFY_POST_COOK =
  "Mau **simpan menu**, atau mulai chat baru?";

const ALL_READY_INTERRUPT =
  "Bahan udah semua ready, siap masak? Bilang atau ketik **mulai masak**.";

const PREP_MODE_ASK =
  "Mau cek bahan **satu-satu** (bilang lanjut / ulang), atau **langsung** siap **mulai masak**?";

export function normalizeUtterance(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.…,!?？！。、;:"""''`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNext(t: string) {
  return (
    /^(lanjut|next|lanjutkan|berikutnya)$/.test(t) ||
    /\b(lanjut(kan)?|next step|langkah berikutnya|langkah selanjutnya)\b/.test(t)
  );
}

function isBack(t: string) {
  return (
    /^(balik|back|previous|sebelumnya)$/.test(t) ||
    /\b(balik|previous|langkah sebelumnya|step sebelumnya|sebelumnya)\b/.test(t)
  );
}

function isRepeat(t: string) {
  return (
    /^(ulang|ulangi|repeat|ulangin)$/.test(t) ||
    /\b(ulang(i|in)?|repeat|baca lagi|ulangi (lagi|step|langkah))\b/.test(t)
  );
}

function isDone(t: string) {
  return (
    /^(selesai|done|finish|finished|beres)$/.test(t) ||
    /\b(selesai|sudah selesai|finish(ed)?|beres)\b/.test(t)
  );
}

function isStart(t: string) {
  return (
    /^(mulai|start)$/.test(t) ||
    /\b(mulai\s+masak(an)?|mulai\s+memasak|start\s+cooking|masak\s+sekarang)\b/.test(
      t,
    )
  );
}

function isAllReady(t: string) {
  return (
    /^(semua siap|siap semua|ready|sudah siap)$/.test(t) ||
    /\b(semua siap|siap semua|i'?m ready|sudah siap semua)\b/.test(t)
  );
}

function isEscape(t: string) {
  return (
    /^(batal|cancel|abort)$/.test(t) ||
    /\b(ganti\s+menu|batal(\s+(masak|aja|deh|lah))?|cancel|stop\s+cooking|menu\s+lain|pesan\s+bahan|enak\s+apa|mau\s+ganti|ganti\s+rencana|abort)\b/.test(
      t,
    )
  );
}

function isSave(t: string) {
  return (
    /^(simpan|save)$/.test(t) ||
    /\b(simpan(\s+menu(nya)?)?|save(\s+menu)?|ya\s+simpan|simpan\s+aja)\b/.test(
      t,
    )
  );
}

function isStop(t: string) {
  return (
    /^(stop|berhenti|akhiri|tutup)$/.test(t) ||
    /\b(stop|berhenti|akhiri(\s+sesi)?|tutup\s+sesi|jangan\s+simpan|gak\s+usah\s+simpan)\b/.test(
      t,
    )
  );
}

function isYes(t: string) {
  return isAffirmative(t) || /^(ganti)$/.test(t);
}

function isNo(t: string) {
  return (
    isNegative(t) ||
    /^(lanjut aja|tetap|jangan)$/.test(t) ||
    /\b(lanjut aja|jangan)\b/.test(t)
  );
}

function now() {
  return new Date().toISOString();
}

function touch(session: CookingSession): CookingSession {
  session.updatedAt = now();
  return saveCookingSession(session);
}

function currentStep(session: CookingSession) {
  const total = session.plan.steps.length;
  const index = Math.min(Math.max(session.stepIndex, 0), Math.max(total - 1, 0));
  const text = session.plan.steps[index] ?? "(tidak ada langkah)";
  return { index, total, text };
}

function stepReply(session: CookingSession, prefix?: string): SessionMessageResult {
  const step = currentStep(session);
  const body = `Langkah ${step.index + 1}/${step.total}\n\n${step.text}`;
  const reply = prefix ? `${prefix}\n\n${body}` : body;
  return {
    session,
    reply,
    cookStep: step,
    speak: step.text,
  };
}

function markTagReady(session: CookingSession, tag: string): boolean {
  const key = tag.toLowerCase().replace(/\s+/g, "_");
  const match = Object.keys(session.prepChecks).find(
    (t) => t === key || t.includes(key) || (key.length >= 3 && key.includes(t)),
  );
  if (!match) return false;
  session.prepChecks[match] = true;
  return true;
}

function allPrepReady(session: CookingSession) {
  return Object.values(session.prepChecks).every(Boolean);
}

function ingredientLabel(session: CookingSession, tag: string): string {
  const ing = session.plan.ingredients.find(
    (i) => i.tag.toLowerCase() === tag.toLowerCase(),
  );
  return formatIngredientLabel({
    name: ing?.name,
    tag,
    qty: ing?.qty,
    unit: ing?.unit,
  });
}

function isPrepWalkChoice(t: string) {
  const n = t.trim().toLowerCase();
  return (
    /^(11|1\s*1|1-1|satu2|satu\s*2|satu-?satu|walk|cek)$/.test(n) ||
    /\b(11|satu2|satu\s*2|satu[\s-]?satu)\b/.test(n) ||
    /\b(sebut\s+(bahan\s+)?satu|bahan\s+satu|cek\s+(bahan\s+)?satu|one\s+by\s+one|ya\s+cek|mau\s+cek)\b/.test(
      n,
    )
  );
}

function isPrepFreeChoice(t: string) {
  const n = t.trim().toLowerCase();
  return (
    /^(langsung|langsung\s+aja|skip|checklist|bebas)$/.test(n) ||
    /\b(langsung(\s+aja)?|skip|checklist|gak\s+usah|nggak\s+usah|tidak\s+usah|bebas)\b/.test(
      n,
    )
  );
}

/** Re-list / re-speak all prep ingredients (free mode). ID + EN. */
function isRelistIngredients(t: string) {
  const n = t.trim().toLowerCase();
  return (
    /\b(ulang|ulangi|sebut(in)?|bacain|daftar)\b.*\bbahan/.test(n) ||
    /\bbahan(-?bahan)?(nya)?\b.*\b(lagi|apa\s+aja|apa\s+saja|sebut)/.test(n) ||
    /\b(list|repeat|say|read)\b.*\bingredients?\b/.test(n) ||
    /\bingredients?\b.*\b(again|list|repeat)\b/.test(n) ||
    /\bwhat\b.*\b(do\s+i\s+need|ingredients?\b)/.test(n) ||
    /^(bahan(nya)?|ingredients?)$/.test(n)
  );
}

function prepIngredientSpeakList(session: CookingSession): string {
  const names = prepTags(session).map((tag) => ingredientLabel(session, tag));
  if (names.length === 0) return `Persiapan bahan untuk ${session.dish}.`;
  return `Bahan untuk ${session.dish}: ${names.join(", ")}. Bilang mulai masak kalau siap.`;
}

function prepRelistReply(session: CookingSession): SessionMessageResult {
  return {
    session,
    reply: prepSummary(session),
    speak: prepIngredientSpeakList(session),
  };
}

function prepTags(session: CookingSession): string[] {
  return session.plan.ingredients.map((i) => i.tag.toLowerCase());
}

function allReadyInterrupt(session: CookingSession): SessionMessageResult {
  touch(session);
  return {
    session,
    reply: ALL_READY_INTERRUPT,
    speak: "Bahan udah semua ready, siap masak? Bilang mulai masak.",
  };
}

function prepStepReply(
  session: CookingSession,
  prefix?: string,
): SessionMessageResult {
  const tags = prepTags(session);
  const total = tags.length;
  const index = Math.min(
    Math.max(session.prepIndex ?? 0, 0),
    Math.max(total - 1, 0),
  );
  const tag = tags[index] ?? "";
  const label = ingredientLabel(session, tag);
  const body = `Bahan ${index + 1}/${total}: **${label}**.\n\nBilang **lanjut** kalau sudah, atau **ulang** / **balik**.`;
  const reply = prefix ? `${prefix}\n\n${body}` : body;
  return {
    session,
    reply,
    prepStep: { index, total, tag, text: label },
    speak: `Bahan ${index + 1} dari ${total}: ${label}. Bilang lanjut kalau sudah.`,
  };
}

function applyPrepWalkNext(session: CookingSession): SessionMessageResult {
  const tags = prepTags(session);
  const idx = session.prepIndex ?? 0;
  const tag = tags[idx];
  if (tag) session.prepChecks[tag] = true;

  if (allPrepReady(session) || idx >= tags.length - 1) {
    // Ensure all marked when finishing last
    for (const t of tags) session.prepChecks[t] = true;
    return allReadyInterrupt(session);
  }

  session.prepIndex = idx + 1;
  touch(session);
  return prepStepReply(session);
}

function applyPrepWalkBack(session: CookingSession): SessionMessageResult {
  session.prepIndex = Math.max(0, (session.prepIndex ?? 0) - 1);
  touch(session);
  return prepStepReply(session, "Kembali ke bahan sebelumnya.");
}

function applyPrepWalkRepeat(session: CookingSession): SessionMessageResult {
  return prepStepReply(session, "Mengulang bahan ini:");
}

function applyPrepAllReadyWalk(session: CookingSession): SessionMessageResult {
  for (const k of Object.keys(session.prepChecks)) {
    session.prepChecks[k] = true;
  }
  return allReadyInterrupt(session);
}

function enterPrepWalk(session: CookingSession): SessionMessageResult {
  session.prepGuide = "walk";
  session.prepIndex = 0;
  touch(session);
  return prepStepReply(session, "Oke — cek bahan satu-satu.");
}

function enterPrepFree(session: CookingSession): SessionMessageResult {
  session.prepGuide = "free";
  touch(session);
  return {
    session,
    reply: prepSummary(session),
    speak: prepIngredientSpeakList(session),
  };
}

function afterMarkInWalk(session: CookingSession): SessionMessageResult {
  if (allPrepReady(session)) return allReadyInterrupt(session);
  const tags = prepTags(session);
  const nextIdx = tags.findIndex((t) => !session.prepChecks[t]);
  if (nextIdx >= 0) {
    session.prepIndex = nextIdx;
    touch(session);
    return prepStepReply(session);
  }
  return allReadyInterrupt(session);
}

function prepSummary(session: CookingSession) {
  const lines = Object.entries(session.prepChecks).map(
    ([tag, ok]) => `${ok ? "✓" : "○"} ${ingredientLabel(session, tag)}`,
  );
  return `Persiapan bahan untuk **${session.dish}**:\n${lines.join("\n")}\n\nKalau semua bahan sudah siap, bilang atau ketik **mulai masak**.`;
}

function applyStart(session: CookingSession): SessionMessageResult {
  session.status = "cooking";
  session.stepIndex = 0;
  touch(session);
  return stepReply(
    session,
    `Mulai masak **${session.dish}**. Bilang **lanjut** / **balik** / **ulang** / **selesai**, atau **ganti menu** bila berubah pikiran.`,
  );
}

function applyAllReady(session: CookingSession): SessionMessageResult {
  for (const k of Object.keys(session.prepChecks)) {
    session.prepChecks[k] = true;
  }
  if (session.prepGuide === "walk") {
    return allReadyInterrupt(session);
  }
  touch(session);
  return {
    session,
    reply: `${prepSummary(session)}\n\nSemua siap. Bilang atau ketik **mulai masak**.`,
  };
}

function enterPostCook(session: CookingSession, prefix: string): SessionMessageResult {
  session.status = "post_cook";
  session.pendingConfirm = null;
  touch(session);
  return {
    session,
    reply: `${prefix}\n\n${CLARIFY_POST_COOK}`,
    speak: `${session.dish} selesai.`,
  };
}

function applyNext(session: CookingSession): SessionMessageResult {
  if (session.stepIndex >= session.plan.steps.length - 1) {
    return enterPostCook(
      session,
      `Itu langkah terakhir. **${session.dish}** selesai — selamat makan!`,
    );
  }
  session.stepIndex += 1;
  touch(session);
  return stepReply(session);
}

function applyBack(session: CookingSession): SessionMessageResult {
  session.stepIndex = Math.max(0, session.stepIndex - 1);
  touch(session);
  return stepReply(session, "Kembali ke langkah sebelumnya.");
}

function applyDone(session: CookingSession): SessionMessageResult {
  return enterPostCook(
    session,
    `Sesi masak **${session.dish}** ditutup. Selamat!`,
  );
}

function applyEscape(session: CookingSession): SessionMessageResult {
  session.pendingConfirm = "abandon_replan";
  touch(session);
  return {
    session,
    reply: `Mau batalkan masak **${session.dish}** dan ganti rencana? (ya / tidak)`,
  };
}

function applyStopOrOffTopic(session: CookingSession): SessionMessageResult {
  session.pendingConfirm = "abandon_replan";
  touch(session);
  return {
    session,
    reply: `Kamu mau akhiri / ganti topik dari **${session.dish}**? (ya / tidak)`,
  };
}

export function applySaveMenu(session: CookingSession): SessionMessageResult {
  const menu = saveCookerMenu(session.cookerAddress, {
    dish: session.dish,
    plan: session.plan,
    pantrySnapshot: [],
  });
  session.menuId = menu.id;
  session.status = "done";
  session.pendingConfirm = null;
  touch(session);
  return {
    session,
    reply: `Menu **${session.dish}** tersimpan.`,
    speak: `Menu ${session.dish} tersimpan.`,
    handoff: { goal: "" },
  };
}

function applyIntent(
  session: CookingSession,
  intent: CookIntent,
): SessionMessageResult | null {
  switch (intent) {
    case "start":
      return applyStart(session);
    case "all_ready":
      return applyAllReady(session);
    case "next":
      return applyNext(session);
    case "back":
      return applyBack(session);
    case "repeat":
      return stepReply(session, "Mengulang langkah ini:");
    case "done":
      return applyDone(session);
    case "escape":
      return applyEscape(session);
    case "save":
      return applySaveMenu(session);
    case "stop":
    case "off_topic":
      return applyStopOrOffTopic(session);
    default:
      return null;
  }
}

function matchPrepKeyword(text: string): CookIntent | null {
  if (isStart(text)) return "start";
  if (isAllReady(text)) return "all_ready";
  if (isSave(text)) return "save";
  if (isStop(text)) return "stop";
  if (isEscape(text)) return "escape";
  return null;
}

function matchCookKeyword(text: string): CookIntent | null {
  if (isSave(text)) return "save";
  if (isStop(text)) return "stop";
  if (isEscape(text)) return "escape";
  if (isNext(text)) return "next";
  if (isBack(text)) return "back";
  if (isRepeat(text)) return "repeat";
  if (isDone(text)) return "done";
  return null;
}

function matchPostCookKeyword(text: string): CookIntent | null {
  if (isSave(text)) return "save";
  if (isStop(text)) return "stop";
  if (isEscape(text)) return "escape";
  if (isDone(text)) return "done";
  return null;
}

function phaseOf(session: CookingSession): CookPhase | null {
  if (session.status === "prep") return "prep";
  if (session.status === "cooking") return "cooking";
  if (session.status === "post_cook") return "post_cook";
  return null;
}

/**
 * Deterministic cook/prep command router + light LLM intent fallback.
 */
export async function handleSessionMessage(
  session: CookingSession,
  raw: string,
): Promise<SessionMessageResult> {
  const text = normalizeUtterance(raw);
  if (!text) {
    const phase = phaseOf(session);
    return {
      session,
      reply:
        phase === "post_cook"
          ? CLARIFY_POST_COOK
          : "Ketik atau bicara: lanjut, balik, ulang, selesai — atau ganti menu.",
    };
  }

  // Pending confirm for abandon/replan / stop / off_topic
  if (session.pendingConfirm === "abandon_replan") {
    let yes = isYes(text) || isEscape(text) || isStop(text);
    let no = isNo(text) || isNext(text) || isSave(text);
    if (!yes && !no) {
      const c = await classifyConfirmIntent(text, "abandon_replan");
      if (c === "yes") yes = true;
      else if (c === "no") no = true;
    }
    if (yes) {
      session.status = "abandoned";
      session.pendingConfirm = null;
      touch(session);
      return {
        session,
        reply: `Oke, masak **${session.dish}** dibatalkan. Ceritakan mau masak apa / bahan apa yang ada.`,
        handoff: { goal: "" },
      };
    }
    if (no) {
      const wasSave = isSave(text);
      session.pendingConfirm = null;
      touch(session);
      if (wasSave) {
        return applySaveMenu(session);
      }
      if (session.status === "cooking") {
        return stepReply(session, "Sip, kita lanjut.");
      }
      if (session.status === "post_cook") {
        return { session, reply: CLARIFY_POST_COOK };
      }
      return { session, reply: prepSummary(session) };
    }
    return {
      session,
      reply: `Kamu mau akhiri / ganti topik dari **${session.dish}**? Bilang atau ketik **ya** atau **tidak**.`,
    };
  }

  // Prep phase — mode ask / walk / free checklist
  if (session.status === "prep") {
    const guide = session.prepGuide ?? "ask";

    // --- Mode ask ---
    if (guide === "ask") {
      if (isStart(text)) {
        const applied = applyStart(session);
        if (applied) return applied;
      }
      if (isPrepWalkChoice(text)) return enterPrepWalk(session);
      if (isPrepFreeChoice(text)) return enterPrepFree(session);
      if (isEscape(text) || isStop(text)) {
        const applied = applyIntent(session, isEscape(text) ? "escape" : "stop");
        if (applied) return applied;
      }
      const llmAsk = await classifyCookIntent({
        text,
        phase: "prep",
        dish: session.dish,
        stepIndex: 0,
        stepTotal: prepTags(session).length,
        prepGuide: "ask",
      });
      if (llmAsk === "start") return applyStart(session);
      if (llmAsk === "prep_walk") return enterPrepWalk(session);
      if (llmAsk === "prep_free") return enterPrepFree(session);
      if (llmAsk === "escape" || llmAsk === "stop" || llmAsk === "off_topic") {
        const applied = applyIntent(session, llmAsk);
        if (applied) return applied;
      }
      return {
        session,
        reply: `Persiapan **${session.dish}**. ${PREP_MODE_ASK}`,
        speak: PREP_MODE_ASK.replace(/\*\*/g, ""),
      };
    }

    // --- Walk mode ---
    if (guide === "walk") {
      if (isStart(text)) return applyStart(session);
      if (isNext(text)) return applyPrepWalkNext(session);
      if (isBack(text)) return applyPrepWalkBack(session);
      if (isRepeat(text)) return applyPrepWalkRepeat(session);
      if (isAllReady(text) || isDone(text)) return applyPrepAllReadyWalk(session);
      if (isSave(text) || isStop(text) || isEscape(text)) {
        const kw = matchPrepKeyword(text);
        if (kw) {
          const applied = applyIntent(session, kw);
          if (applied) return applied;
        }
      }

      const siapMatch = text.match(
        /(?:^|\s)([a-z0-9_]+)\s+siap\b|\bsiap\s+([a-z0-9_]+)/i,
      );
      if (siapMatch) {
        const tag = (siapMatch[1] || siapMatch[2] || "").toLowerCase();
        if (markTagReady(session, tag)) {
          return afterMarkInWalk(session);
        }
      }
      const maybeTag = text.replace(/\s+/g, "_");
      if (maybeTag.length >= 3 && markTagReady(session, maybeTag)) {
        return afterMarkInWalk(session);
      }

      // lanjut when already all ready
      if (allPrepReady(session) && isNext(text)) {
        return allReadyInterrupt(session);
      }

      const llm = await classifyCookIntent({
        text,
        phase: "prep",
        dish: session.dish,
        stepIndex: session.prepIndex ?? 0,
        stepTotal: prepTags(session).length,
        prepGuide: "walk",
      });
      if (llm === "start") return applyStart(session);
      if (llm === "next") return applyPrepWalkNext(session);
      if (llm === "back") return applyPrepWalkBack(session);
      if (llm === "repeat") return applyPrepWalkRepeat(session);
      if (llm === "all_ready" || llm === "done") return applyPrepAllReadyWalk(session);
      if (llm === "escape" || llm === "stop" || llm === "off_topic" || llm === "save") {
        const applied = applyIntent(session, llm);
        if (applied) return applied;
      }

      return prepStepReply(session, "Bilang **lanjut** / **ulang** / **balik**, atau **mulai masak**.");
    }

    // --- Free checklist mode ---
    if (isPrepWalkChoice(text)) return enterPrepWalk(session);
    if (isRelistIngredients(text) || isRepeat(text)) {
      return prepRelistReply(session);
    }

    const kw = matchPrepKeyword(text);
    if (kw) {
      const applied = applyIntent(session, kw);
      if (applied) return applied;
    }

    const siapMatch = text.match(
      /(?:^|\s)([a-z0-9_]+)\s+siap\b|\bsiap\s+([a-z0-9_]+)/i,
    );
    if (siapMatch) {
      const tag = (siapMatch[1] || siapMatch[2] || "").toLowerCase();
      if (markTagReady(session, tag)) {
        touch(session);
        const extra = allPrepReady(session)
          ? `\n\n${ALL_READY_INTERRUPT}`
          : "";
        return { session, reply: `${prepSummary(session)}${extra}` };
      }
    }

    const maybeTag = text.replace(/\s+/g, "_");
    if (maybeTag.length >= 3 && markTagReady(session, maybeTag)) {
      touch(session);
      const extra = allPrepReady(session)
        ? `\n\n${ALL_READY_INTERRUPT}`
        : "";
      return { session, reply: `${prepSummary(session)}${extra}` };
    }

    // lanjut while free + all ready → interrupt
    if (isNext(text) && allPrepReady(session)) {
      return allReadyInterrupt(session);
    }

    const llm = await classifyCookIntent({
      text,
      phase: "prep",
      dish: session.dish,
      stepIndex: session.stepIndex,
      stepTotal: session.plan.steps.length,
      prepGuide: "free",
    });
    if (llm === "start") {
      const applied = applyIntent(session, llm);
      if (applied) return applied;
    }
    if (llm === "repeat") return prepRelistReply(session);
    if (llm === "prep_walk") return enterPrepWalk(session);
    if (
      llm === "all_ready" ||
      llm === "escape" ||
      llm === "stop" ||
      llm === "off_topic" ||
      llm === "save"
    ) {
      const applied = applyIntent(session, llm);
      if (applied) return applied;
    }

    return prepRelistReply(session);
  }

  // Cooking phase
  if (session.status === "cooking") {
    const kw = matchCookKeyword(text);
    if (kw) {
      const applied = applyIntent(session, kw);
      if (applied) return applied;
    }

    const llm = await classifyCookIntent({
      text,
      phase: "cooking",
      dish: session.dish,
      stepIndex: session.stepIndex,
      stepTotal: session.plan.steps.length,
    });
    if (llm !== "unclear" && llm !== "start" && llm !== "all_ready") {
      const applied = applyIntent(session, llm);
      if (applied) return applied;
    }

    return { session, reply: CLARIFY_COOK };
  }

  // Post-cook wrap-up — save / stop / new topic only
  if (session.status === "post_cook") {
    const kw = matchPostCookKeyword(text);
    if (kw === "done") {
      // Already finished cooking — treat "selesai" as stop confirm
      return applyStopOrOffTopic(session);
    }
    if (kw) {
      const applied = applyIntent(session, kw);
      if (applied) return applied;
    }

    const llm = await classifyCookIntent({
      text,
      phase: "post_cook",
      dish: session.dish,
      stepIndex: session.stepIndex,
      stepTotal: session.plan.steps.length,
    });
    if (
      llm === "save" ||
      llm === "stop" ||
      llm === "off_topic" ||
      llm === "escape"
    ) {
      const applied = applyIntent(session, llm);
      if (applied) return applied;
    }

    return { session, reply: CLARIFY_POST_COOK };
  }

  return {
    session,
    reply: `Sesi status **${session.status}**. Mulai rencana baru dari chat biasa.`,
  };
}

export function buildPrepChecks(ingredients: { tag: string }[]): Record<string, boolean> {
  const checks: Record<string, boolean> = {};
  for (const ing of ingredients) {
    checks[ing.tag.toLowerCase()] = false;
  }
  return checks;
}

export function formatPrepIntro(session: CookingSession): string {
  return `Persiapan **${session.dish}**. ${PREP_MODE_ASK}`;
}
