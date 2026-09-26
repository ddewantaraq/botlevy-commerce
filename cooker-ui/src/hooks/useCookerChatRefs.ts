import { useRef } from "react";
import { createSpeechRecognition } from "@botlevy-commerce/shared";
import type { ChatMessage, CookingSession, PendingCookStart } from "../types/chat";

export type { PendingCookStart };

export function isActiveCookStatus(status: string | null | undefined) {
  return status === "prep" || status === "cooking" || status === "post_cook";
}

/** Shared refs for mic / session / agent coordination (PWA ASR timing). */
export function useCookerChatRefs() {
  const bottomRef = useRef<HTMLDivElement>(null);
  const handsFreeRef = useRef(false);
  const busyRef = useRef(false);
  const ttsSpeakingRef = useRef(false);
  const pendingHandsFreeAskRef = useRef(false);
  const handsFreeAskedSessionRef = useRef<string | null>(null);
  const sessionRef = useRef<CookingSession | null>(null);
  const sessionStatusRef = useRef<string | null>(null);
  const replyLangRef = useRef<"id" | "en">("id");
  const messagesRef = useRef<ChatMessage[]>([]);
  const recRef = useRef<ReturnType<typeof createSpeechRecognition>>(null);
  const rearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Permission granted this page session — do not hold a live MediaStream (blocks ASR on Android). */
  const micPermissionOkRef = useRef(false);
  const browserHintShownRef = useRef(false);
  const pendingCookStartRef = useRef<PendingCookStart | null>(null);

  return {
    bottomRef,
    handsFreeRef,
    busyRef,
    ttsSpeakingRef,
    pendingHandsFreeAskRef,
    handsFreeAskedSessionRef,
    sessionRef,
    sessionStatusRef,
    replyLangRef,
    messagesRef,
    recRef,
    rearmTimerRef,
    micPermissionOkRef,
    browserHintShownRef,
    pendingCookStartRef,
  };
}

export type CookerChatRefs = ReturnType<typeof useCookerChatRefs>;
