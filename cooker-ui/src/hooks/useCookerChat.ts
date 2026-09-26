import { useRef } from "react";
import type { ChatMessage } from "../types/chat";
import { useAgentChat } from "./useAgentChat";
import { useCookerAuth } from "./useCookerAuth";
import { useCookerChatRefs } from "./useCookerChatRefs";
import { useCookerOnboarding } from "./useCookerOnboarding";
import { useCookSession } from "./useCookSession";
import { useHandsFreeMic } from "./useHandsFreeMic";

type PushFn = (msg: Omit<ChatMessage, "id" | "at">) => void;

type MicBridge = {
  micSupported: boolean;
  speakAgent: (text: string, lang?: "id" | "en") => void;
  scheduleRearm: (ms?: number) => void;
  resetHandsFreeAndMic: () => void;
  askHandsFreeOnce: (sessionId: string) => void;
  resolveHandsFreeAsk: (enable: boolean) => void;
};

/**
 * Thin compositor — same public API as the former monolithic useCookerChat.
 * Cross-hook calls go through bridge refs so mic / session / agent can compose.
 */
export function useCookerChat() {
  const refs = useCookerChatRefs();
  const onboarding = useCookerOnboarding();

  const pushRef = useRef<PushFn>(() => {});
  const setBusyRef = useRef<(busy: boolean) => void>(() => {});
  const setErrorRef = useRef<(msg: string) => void>(() => {});
  const setPantryRef = useRef<(pantry: string[]) => void>(() => {});
  const micBridge = useRef<MicBridge>({
    micSupported: false,
    speakAgent: () => {},
    scheduleRearm: () => {},
    resetHandsFreeAndMic: () => {},
    askHandsFreeOnce: () => {},
    resolveHandsFreeAsk: () => {},
  });

  const cookSession = useCookSession({
    refs,
    mic: {
      get micSupported() {
        return micBridge.current.micSupported;
      },
      speakAgent: (text, lang) => micBridge.current.speakAgent(text, lang),
      resetHandsFreeAndMic: () => micBridge.current.resetHandsFreeAndMic(),
      askHandsFreeOnce: (id) => micBridge.current.askHandsFreeOnce(id),
    },
    push: (msg) => pushRef.current(msg),
    setBusy: (busy) => setBusyRef.current(busy),
    setError: (msg) => setErrorRef.current(msg),
  });

  const auth = useCookerAuth({
    refs,
    setSession: cookSession.setSession,
    setPantry: (pantry) => setPantryRef.current(pantry),
    onLogoutClear: () => cookSession.clearCookSession(),
  });

  const agent = useAgentChat({
    refs,
    signedIn: auth.signedIn,
    address: auth.address,
    wrongChain: auth.wrongChain,
    mic: {
      get micSupported() {
        return micBridge.current.micSupported;
      },
      speakAgent: (text, lang) => micBridge.current.speakAgent(text, lang),
      scheduleRearm: (ms) => micBridge.current.scheduleRearm(ms),
      askHandsFreeOnce: (id) => micBridge.current.askHandsFreeOnce(id),
      resolveHandsFreeAsk: (enable) =>
        micBridge.current.resolveHandsFreeAsk(enable),
    },
    cookSession: {
      session: cookSession.session,
      applySession: cookSession.applySession,
      clearCookSession: cookSession.clearCookSession,
      ensureActiveSession: cookSession.ensureActiveSession,
      startPrep: cookSession.startPrep,
      stashOrSpeakIntro: cookSession.stashOrSpeakIntro,
    },
  });

  pushRef.current = agent.push;
  setBusyRef.current = agent.setBusy;
  setErrorRef.current = agent.setError;
  setPantryRef.current = agent.setPantry;

  const mic = useHandsFreeMic({
    refs,
    session: cookSession.session,
    busy: agent.busy,
    setError: agent.setError,
    push: agent.push,
    onTranscript: (text) => {
      // Always call latest handleSend via agent object from this render —
      // useHandsFreeMic keeps onTranscript in a ref updated each render.
      void agent.handleSend(text);
    },
    flushPendingCookStart: cookSession.flushPendingCookStart,
  });

  micBridge.current = {
    micSupported: mic.micSupported,
    speakAgent: mic.speakAgent,
    scheduleRearm: mic.scheduleRearm,
    resetHandsFreeAndMic: mic.resetHandsFreeAndMic,
    askHandsFreeOnce: mic.askHandsFreeOnce,
    resolveHandsFreeAsk: mic.resolveHandsFreeAsk,
  };

  return {
    showOnboarding: onboarding.showOnboarding,
    finishOnboarding: onboarding.finishOnboarding,
    showLoginHelp: onboarding.showLoginHelp,
    openLoginHelp: onboarding.openLoginHelp,
    closeLoginHelp: onboarding.closeLoginHelp,
    session: cookSession.session,
    handsFree: mic.handsFree,
    pendingHandsFreeAsk: mic.pendingHandsFreeAsk,
    signedIn: auth.signedIn,
    walletBusy: auth.walletBusy,
    buttonLabel: auth.buttonLabel,
    walletError: auth.walletError,
    connectError: auth.connectError,
    address: auth.address,
    wrongChain: auth.wrongChain,
    startLogin: auth.startLogin,
    logout: auth.logout,
    switchToBsc: auth.switchToBsc,
    messages: agent.messages,
    busy: agent.busy,
    bottomRef: refs.bottomRef,
    paying: agent.paying,
    confirmingPay: agent.confirmingPay,
    handleSend: agent.handleSend,
    togglePrepTag: cookSession.togglePrepTag,
    pickDish: agent.pickDish,
    payQuote: agent.payQuote,
    startPrep: cookSession.startPrep,
    saveMenu: agent.saveMenu,
    draft: agent.draft,
    setDraft: agent.setDraft,
    error: agent.error,
    micSupported: mic.micSupported,
    listening: mic.listening,
    ttsSpeaking: mic.ttsSpeaking,
    pantry: agent.pantry,
    toggleMic: mic.toggleMic,
    resolveHandsFreeAsk: mic.resolveHandsFreeAsk,
    stopTts: mic.stopTts,
  };
}
