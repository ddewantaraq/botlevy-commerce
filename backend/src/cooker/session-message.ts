import type { CookingSession } from "../store.js";
import { saveCookerMenu, saveCookingSession } from "../store.js";
import {
  classifyCookIntent,
  type CookIntent,
  type CookPhase,
} from "./cook-intent.js";

export type SessionMessageResult = {
  session: CookingSession;
  reply: string;
  cookStep?: { index: number; total: number; text: string };
  handoff?: { goal: string };
  speak?: string;
};

const CLARIFY_COOK =
  "Mau **lanjut** langkah ini, atau **ganti menu**? (bisa juga: balik, ulang, selesai)";

const CLARIFY_POST_COOK =
  "Mau **simpan menu**, atau mulai chat baru?";

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
  return /\b(ganti menu|batal masak|cancel|stop cooking|menu lain|pesan bahan|enak apa|mau ganti|ganti rencana|abort)\b/.test(
    t,
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
  return /^(ya|yes|y|iya|betul|benar|ok|oke|ganti|batal)$/.test(t);
}

function isNo(t: string) {
  return (
    /^(tidak|no|nggak|gak|lanjut aja|tetap|jangan)$/.test(t) ||
    /\b(tidak|lanjut aja|jangan)\b/.test(t)
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

function prepSummary(session: CookingSession) {
  const lines = Object.entries(session.prepChecks).map(
    ([tag, ok]) => `${ok ? "✓" : "○"} ${tag}`,
  );
  return `Persiapan bahan untuk **${session.dish}**:\n${lines.join("\n")}\n\nCentang di chat (“semua siap”) atau bilang bahan yang sudah siap, lalu “mulai masak”.`;
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
    if (isYes(text) || isEscape(text) || isStop(text)) {
      session.status = "abandoned";
      session.pendingConfirm = null;
      touch(session);
      return {
        session,
        reply: `Oke, masak **${session.dish}** dibatalkan. Ceritakan mau masak apa / bahan apa yang ada.`,
        handoff: { goal: "" },
      };
    }
    if (isNo(text) || isNext(text) || isSave(text)) {
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
      reply: `Kamu mau akhiri / ganti topik dari **${session.dish}**? Ketik **ya** atau **tidak**.`,
    };
  }

  // Prep phase — commands before ingredient-tag heuristics
  if (session.status === "prep") {
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
          ? "\n\nSemua bahan siap. Ketik **mulai masak**."
          : "";
        return { session, reply: `${prepSummary(session)}${extra}` };
      }
    }

    const maybeTag = text.replace(/\s+/g, "_");
    if (maybeTag.length >= 3 && markTagReady(session, maybeTag)) {
      touch(session);
      const extra = allPrepReady(session)
        ? "\n\nSemua bahan siap. Ketik **mulai masak**."
        : "";
      return { session, reply: `${prepSummary(session)}${extra}` };
    }

    const llm = await classifyCookIntent({
      text,
      phase: "prep",
      dish: session.dish,
      stepIndex: session.stepIndex,
      stepTotal: session.plan.steps.length,
    });
    if (
      llm === "start" ||
      llm === "all_ready" ||
      llm === "escape" ||
      llm === "stop" ||
      llm === "off_topic" ||
      llm === "save"
    ) {
      const applied = applyIntent(session, llm);
      if (applied) return applied;
    }

    return { session, reply: prepSummary(session) };
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
  return prepSummary(session);
}
