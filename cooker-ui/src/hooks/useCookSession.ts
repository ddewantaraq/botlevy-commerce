import { useState } from "react";
import { API_URL } from "@botlevy-commerce/shared";
import type { ChatMessage, CookingSession, Plan } from "../types/chat";
import {
  isActiveCookStatus,
  type CookerChatRefs,
  type PendingCookStart,
} from "./useCookerChatRefs";

type PushFn = (msg: Omit<ChatMessage, "id" | "at">) => void;

type MicApi = {
  micSupported: boolean;
  speakAgent: (text: string, lang?: "id" | "en") => void;
  resetHandsFreeAndMic: () => void;
  askHandsFreeOnce: (sessionId: string) => void;
};

type Opts = {
  refs: CookerChatRefs;
  mic: MicApi;
  push: PushFn;
  setBusy: (busy: boolean) => void;
  setError: (msg: string) => void;
};

export function useCookSession({ refs, mic, push, setBusy, setError }: Opts) {
  const [session, setSession] = useState<CookingSession | null>(null);
  const { sessionRef, sessionStatusRef, pendingCookStartRef, handsFreeAskedSessionRef } =
    refs;

  function applySession(next: CookingSession | null) {
    sessionRef.current = next;
    sessionStatusRef.current = next?.status ?? null;
    setSession(next);
  }

  function clearCookSession(opts?: { abandon?: boolean }) {
    const id = sessionRef.current?.id ?? session?.id;
    const shouldAbandon = opts?.abandon !== false;
    mic.resetHandsFreeAndMic();
    applySession(null);
    if (shouldAbandon && id) {
      void fetch(`${API_URL}/cooker/sessions/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "abandoned", pendingConfirm: null }),
      }).catch(() => {
        /* ignore */
      });
    }
  }

  async function ensureActiveSession(): Promise<CookingSession | null> {
    const local = sessionRef.current;
    if (local && isActiveCookStatus(local.status)) return local;

    try {
      const res = await fetch(`${API_URL}/cooker/sessions/active`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session && isActiveCookStatus(data.session.status)) {
          applySession(data.session);
          return data.session;
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  function flushPendingCookStart() {
    const stashed = pendingCookStartRef.current;
    pendingCookStartRef.current = null;
    if (!stashed) return false;
    push({
      role: "agent",
      text: stashed.reply,
      kind: stashed.kind ?? "text",
      cookStep: stashed.cookStep,
      prepStep: stashed.prepStep,
      sessionId: stashed.sessionId,
      prepChecks: stashed.prepChecks,
      plan: stashed.plan,
    });
    mic.speakAgent(stashed.speak || stashed.reply);
    return true;
  }

  function stashOrSpeakIntro(intro: PendingCookStart, runId?: string) {
    if (
      mic.micSupported &&
      handsFreeAskedSessionRef.current !== intro.sessionId
    ) {
      pendingCookStartRef.current = intro;
      mic.askHandsFreeOnce(intro.sessionId);
      return;
    }
    push({
      role: "agent",
      text: intro.reply,
      kind: intro.kind,
      sessionId: intro.sessionId,
      prepChecks: intro.prepChecks,
      plan: intro.plan,
      cookStep: intro.cookStep,
      prepStep: intro.prepStep,
      ...(runId ? { runId } : {}),
    });
    mic.speakAgent(intro.speak || intro.reply);
  }

  async function startPrep(runId: string) {
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/cooker/sessions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Cannot start prep");
      applySession(data.session);
      stashOrSpeakIntro({
        reply: data.reply as string,
        speak: data.reply as string,
        prepChecks: data.session.prepChecks as Record<string, boolean>,
        plan: data.session.plan as Plan,
        sessionId: data.session.id as string,
        kind: "prep_ask",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function togglePrepTag(tag: string, value: boolean) {
    if (!session) return;
    const prepChecks = { ...session.prepChecks, [tag]: value };
    const res = await fetch(`${API_URL}/cooker/sessions/${session.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepChecks }),
    });
    const data = await res.json();
    if (data.ok) applySession(data.session);
  }

  return {
    session,
    setSession: applySession,
    clearCookSession,
    ensureActiveSession,
    flushPendingCookStart,
    stashOrSpeakIntro,
    startPrep,
    togglePrepTag,
    applySession,
  };
}
