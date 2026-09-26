import { API_URL } from "@botlevy-commerce/shared";
import { clarifyFallback, planResultText, sessionReplyKind } from "./agent-chat";
import { resolveUiLang } from "./chat-lang";
import type {
  ChatMessage,
  CookingSession,
  PendingCookStart,
} from "../types/chat";

type PushFn = (msg: Omit<ChatMessage, "id" | "at">) => void;
type PushAgentFn = (msg: Omit<ChatMessage, "id" | "at" | "role">) => void;

export type AgentRunDeps = {
  pantry: string[];
  replyLangRef: { current: "id" | "en" };
  setReplyLang: (lang: "id" | "en") => void;
  sessionRef: { current: CookingSession | null };
  handsFreeAskedSessionRef: { current: string | null };
  pendingCookStartRef: { current: PendingCookStart | null };
  micSupported: boolean;
  speakAgent: (text: string) => void;
  askHandsFreeOnce: (sessionId: string) => void;
  applySession: (session: CookingSession | null) => void;
  clearCookSession: (opts?: { abandon?: boolean }) => void;
  stashOrSpeakIntro: (intro: PendingCookStart, runId?: string) => void;
  push: PushFn;
  pushAgent: PushAgentFn;
};

export async function runPlanning(deps: AgentRunDeps, goal: string, selectedDish?: string) {
  const lang = resolveUiLang(goal, deps.replyLangRef.current);
  deps.replyLangRef.current = lang;
  deps.setReplyLang(lang);
  const res = await fetch(`${API_URL}/agent/runs`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal,
      pantry: deps.pantry,
      ...(selectedDish ? { selectedDish } : {}),
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    deps.pushAgent({
      text: data.message || (lang === "en" ? "Agent run failed" : "Agent gagal"),
      kind: "text",
      steps: data.steps,
    });
    return;
  }

  if (data.status === "prep" && data.session) {
    deps.applySession(data.session);
    deps.stashOrSpeakIntro(
      {
        reply: data.reply || data.message || "Prep",
        speak: data.reply || data.message,
        prepChecks: data.session.prepChecks,
        plan: data.session.plan,
        sessionId: data.session.id,
        kind: "prep_ask",
      },
      data.runId,
    );
    return;
  }

  if (
    data.status === "clarify" ||
    data.status === "ask_reset" ||
    data.status === "ask_bahan" ||
    data.status === "confirm_gap" ||
    data.status === "ask_quote" ||
    data.status === "idle"
  ) {
    if (
      data.status === "ask_reset" ||
      data.reset === "reset_done" ||
      data.reset === "reset_idle" ||
      data.reset === "ask_reset"
    ) {
      deps.clearCookSession();
    }
    deps.pushAgent({
      text: data.message || clarifyFallback(data.status, lang),
      kind:
        data.status === "clarify" || data.status === "ask_reset"
          ? "text"
          : "plan_result",
      status: data.status,
      plan: data.plan,
      runId: data.runId,
    });
    return;
  }

  deps.pushAgent({
    text: planResultText(data, lang),
    kind: "plan_result",
    status: data.status,
    intent: data.intent,
    suggestions: data.suggestions,
    plan: data.plan,
    quote: data.quote,
    steps: data.steps,
    runId: data.runId,
  });
}

export async function sendSessionMessage(deps: AgentRunDeps, text: string) {
  const activeSession = deps.sessionRef.current;
  if (!activeSession) return;
  const wasCooking = activeSession.status === "cooking";
  const res = await fetch(
    `${API_URL}/cooker/sessions/${activeSession.id}/message`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    },
  );
  const data = await res.json();
  if (!res.ok || !data.ok) {
    const msg =
      typeof data.message === "string" ? data.message : "Session message failed";
    if (msg.includes("Session is not active")) {
      deps.clearCookSession({ abandon: false });
      await runPlanning(deps, text);
      return;
    }
    deps.pushAgent({ text: msg, kind: "text" });
    return;
  }
  deps.applySession(data.session);

  const enteringCooking =
    data.session.status === "cooking" &&
    !wasCooking &&
    deps.micSupported &&
    deps.handsFreeAskedSessionRef.current !== data.session.id;

  if (enteringCooking) {
    deps.pendingCookStartRef.current = {
      reply: data.reply,
      speak: data.speak,
      cookStep: data.cookStep,
      prepChecks: data.session.prepChecks,
      plan: data.session.plan,
      sessionId: data.session.id,
      kind: data.cookStep ? "cook_step" : "text",
    };
    deps.askHandsFreeOnce(data.session.id);
  } else {
    deps.push({
      role: "agent",
      text: data.reply,
      kind: sessionReplyKind(data),
      cookStep: data.cookStep,
      prepStep: data.prepStep,
      sessionId: data.session.id,
      prepChecks: data.session.prepChecks,
      plan: data.session.plan,
    });
    deps.speakAgent(data.speak || data.reply);
  }

  if (
    data.handoff ||
    data.session.status === "abandoned" ||
    data.session.status === "done"
  ) {
    deps.clearCookSession({ abandon: false });
  }
}
