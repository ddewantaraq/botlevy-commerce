import type { CookingSession } from "../store.js";
import { saveCookingSession } from "../store.js";

export type SessionMessageResult = {
  session: CookingSession;
  reply: string;
  /** Large cook step for UI */
  cookStep?: { index: number; total: number; text: string };
  /** Client should call /agent/runs with this goal */
  handoff?: { goal: string };
  speak?: string;
};

const NEXT_RE =
  /^\s*(lanjut|next|lanjutkan|berikutnya|next step|langkah berikutnya)\s*[.!]?\s*$/i;
const BACK_RE =
  /^\s*(balik|back|previous|sebelumnya|langkah sebelumnya)\s*[.!]?\s*$/i;
const REPEAT_RE =
  /^\s*(ulang|ulangi|repeat|baca lagi|ulangin)\s*[.!]?\s*$/i;
const DONE_RE =
  /^\s*(selesai|done|sudah|finish|finished|beres)\s*[.!]?\s*$/i;
const START_RE =
  /^\s*(mulai|mulai masak|start|start cooking|masak sekarang)\s*[.!]?\s*$/i;
const ALL_READY_RE =
  /^\s*(semua siap|siap semua|ready|i'?m ready|sudah siap)\s*[.!]?\s*$/i;
const YES_RE = /^\s*(ya|yes|y|iya|betul|benar|ok|oke|ganti|batal)\s*[.!]?\s*$/i;
const NO_RE =
  /^\s*(tidak|no|nggak|gak|lanjut aja|tetap|jangan)\s*[.!]?\s*$/i;
const ESCAPE_RE =
  /\b(ganti menu|batal masak|cancel|stop cooking|menu lain|pesan bahan|enak apa|mau ganti|ganti rencana|abort)\b/i;

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
  const key = tag.toLowerCase();
  const match = Object.keys(session.prepChecks).find(
    (t) => t === key || t.includes(key) || key.includes(t),
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

/**
 * Deterministic cook/prep command router with escape-to-replan confirm.
 */
export function handleSessionMessage(
  session: CookingSession,
  raw: string,
): SessionMessageResult {
  const text = raw.trim();
  if (!text) {
    return {
      session,
      reply: "Ketik atau bicara: lanjut, balik, ulang, selesai — atau ganti menu.",
    };
  }

  // Pending confirm for abandon/replan
  if (session.pendingConfirm === "abandon_replan") {
    if (YES_RE.test(text) || ESCAPE_RE.test(text)) {
      session.status = "abandoned";
      session.pendingConfirm = null;
      touch(session);
      return {
        session,
        reply: `Oke, masak **${session.dish}** dibatalkan. Ceritakan mau masak apa / bahan apa yang ada.`,
        handoff: { goal: "" },
      };
    }
    if (NO_RE.test(text) || NEXT_RE.test(text)) {
      session.pendingConfirm = null;
      touch(session);
      if (session.status === "cooking") {
        return stepReply(session, "Sip, kita lanjut.");
      }
      return { session, reply: prepSummary(session) };
    }
    return {
      session,
      reply: `Mau batalkan masak **${session.dish}** dan ganti rencana? Ketik **ya** atau **tidak**.`,
    };
  }

  // Escape / new intent
  if (ESCAPE_RE.test(text) && !NEXT_RE.test(text) && !YES_RE.test(text)) {
    session.pendingConfirm = "abandon_replan";
    touch(session);
    return {
      session,
      reply: `Mau batalkan masak **${session.dish}** dan ganti rencana? (ya / tidak)`,
    };
  }

  // Prep phase
  if (session.status === "prep") {
    if (ALL_READY_RE.test(text)) {
      for (const k of Object.keys(session.prepChecks)) {
        session.prepChecks[k] = true;
      }
      touch(session);
      return {
        session,
        reply: `${prepSummary(session)}\n\nSemua siap. Bilang atau ketik **mulai masak**.`,
      };
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

    // Toggle-like: bare ingredient tag name
    const maybeTag = text.toLowerCase().replace(/\s+/g, "_");
    if (markTagReady(session, maybeTag)) {
      touch(session);
      const extra = allPrepReady(session)
        ? "\n\nSemua bahan siap. Ketik **mulai masak**."
        : "";
      return { session, reply: `${prepSummary(session)}${extra}` };
    }

    if (START_RE.test(text)) {
      session.status = "cooking";
      session.stepIndex = 0;
      touch(session);
      return stepReply(
        session,
        `Mulai masak **${session.dish}**. Bilang **lanjut** / **balik** / **ulang** / **selesai**, atau **ganti menu** bila berubah pikiran.`,
      );
    }

    return { session, reply: prepSummary(session) };
  }

  // Cooking phase
  if (session.status === "cooking") {
    if (NEXT_RE.test(text)) {
      if (session.stepIndex >= session.plan.steps.length - 1) {
        session.status = "done";
        touch(session);
        return {
          session,
          reply: `Itu langkah terakhir. **${session.dish}** selesai — selamat makan! Mau simpan menu ini?`,
          speak: `${session.dish} selesai.`,
        };
      }
      session.stepIndex += 1;
      touch(session);
      return stepReply(session);
    }

    if (BACK_RE.test(text)) {
      session.stepIndex = Math.max(0, session.stepIndex - 1);
      touch(session);
      return stepReply(session, "Kembali ke langkah sebelumnya.");
    }

    if (REPEAT_RE.test(text)) {
      return stepReply(session, "Mengulang langkah ini:");
    }

    if (DONE_RE.test(text)) {
      session.status = "done";
      touch(session);
      return {
        session,
        reply: `Sesi masak **${session.dish}** ditutup. Selamat! Mau simpan menu?`,
        speak: "Selesai.",
      };
    }

    return {
      session,
      reply:
        "Mau **lanjut** langkah ini, atau **ganti menu**? (bisa juga: balik, ulang, selesai)",
    };
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
