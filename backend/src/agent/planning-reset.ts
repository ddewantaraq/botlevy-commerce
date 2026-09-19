import { classifyConfirmIntent } from "../cooker/confirm-intent.js";
import { detectReplyLang, pickCopy } from "./reply-lang.js";
import {
  clearPlanningMemory,
  clearPendingReset,
  getLastSuggestions,
  getPlanningDraft,
  hasPendingReset,
  setPendingReset,
} from "../store.js";

/** User wants to abandon current planning and start fresh. */
export function isPlanningEscape(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.…,!?]+$/g, "")
    .trim();
  return (
    /^(batal|cancel|abort|stop)$/.test(t) ||
    /^(menu\s+baru|ganti\s+menu|chat\s+baru|mulai\s+baru|start\s+over|new\s+chat|new\s+menu)$/.test(
      t,
    ) ||
    /\b(menu\s+baru|ganti\s+menu|batal\s+(aja|deh|lah)|cancel\s+all|start\s+over)\b/.test(
      t,
    )
  );
}

export function hasActivePlanningContext(address: string): boolean {
  return Boolean(getPlanningDraft(address) || getLastSuggestions(address).length);
}

export type ResetTurnResult = {
  status: "ask_reset" | "reset_done" | "reset_cancelled" | "reset_idle";
  message: string;
};

/**
 * Handle batal / menu baru (+ yakin confirm). Returns null if not an escape turn.
 */
export async function handlePlanningResetTurn(
  address: string,
  goal: string,
): Promise<ResetTurnResult | null> {
  const lang = detectReplyLang(goal);
  const a = address.toLowerCase();

  if (hasPendingReset(a)) {
    const confirm = await classifyConfirmIntent(goal, "generic");
    if (confirm === "yes") {
      clearPlanningMemory(a);
      return {
        status: "reset_done",
        message: pickCopy(
          lang,
          "Oke, chat baru. Mau masak apa, atau bahan apa yang ada?",
          "OK, fresh start. What do you want to cook, or what ingredients do you have?",
        ),
      };
    }
    if (confirm === "no") {
      clearPendingReset(a);
      return {
        status: "reset_cancelled",
        message: pickCopy(
          lang,
          "Sip, lanjut rencana sebelumnya. Bilang **ya**/**tidak** kalau masih di konfirmasi, atau sebut langkah berikutnya.",
          "OK, continuing. Say **yes**/**no** if you were confirming, or your next step.",
        ),
      };
    }
    return {
      status: "ask_reset",
      message: pickCopy(
        lang,
        "Yakin mulai chat baru? Bilang **ya** atau **tidak**.",
        "Sure you want a new chat? Say **yes** or **no**.",
      ),
    };
  }

  if (!isPlanningEscape(goal)) return null;

  if (hasActivePlanningContext(a)) {
    setPendingReset(a);
    return {
      status: "ask_reset",
      message: pickCopy(
        lang,
        "Yakin mulai chat baru? (rencana / saran menu sekarang akan dihapus) Bilang **ya** atau **tidak**.",
        "Start a new chat? (current plan / suggestions will be cleared) Say **yes** or **no**.",
      ),
    };
  }

  clearPlanningMemory(a);
  return {
    status: "reset_idle",
    message: pickCopy(
      lang,
      "Siap — mau masak apa?",
      "Ready — what do you want to cook?",
    ),
  };
}
