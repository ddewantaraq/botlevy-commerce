import { useEffect, useRef, useState } from "react";
import {
  createSpeechRecognition,
  isSpeechRecognitionSupported,
  speakText,
  stopSpeaking,
  transcriptFromRecognitionResults,
} from "@botlevy-commerce/shared";
import { plainForSpeech, ttsLangFor } from "../lib/chat-lang";
import type { ChatMessage, CookingSession } from "../types/chat";
import type { CookerChatRefs } from "./useCookerChatRefs";

type PushFn = (msg: Omit<ChatMessage, "id" | "at">) => void;

type Opts = {
  refs: CookerChatRefs;
  session: CookingSession | null;
  busy: boolean;
  setError: (msg: string) => void;
  push: PushFn;
  onTranscript: (text: string) => void;
  flushPendingCookStart: () => boolean;
};

export function useHandsFreeMic({
  refs,
  session,
  busy,
  setError,
  push,
  onTranscript,
  flushPendingCookStart,
}: Opts) {
  const [listening, setListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [pendingHandsFreeAsk, setPendingHandsFreeAsk] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const micSupported = isSpeechRecognitionSupported();

  // Always-current callbacks — SpeechRecognition handlers outlive the render
  // that called startMicLoop (stale busy/signedIn was ignoring transcripts).
  const onTranscriptRef = useRef(onTranscript);
  const pushRef = useRef(push);
  const setErrorRef = useRef(setError);
  const flushPendingRef = useRef(flushPendingCookStart);
  onTranscriptRef.current = onTranscript;
  pushRef.current = push;
  setErrorRef.current = setError;
  flushPendingRef.current = flushPendingCookStart;

  const {
    handsFreeRef,
    busyRef,
    ttsSpeakingRef,
    pendingHandsFreeAskRef,
    handsFreeAskedSessionRef,
    sessionRef,
    sessionStatusRef,
    replyLangRef,
    recRef,
    rearmTimerRef,
    micPermissionOkRef,
    browserHintShownRef,
    pendingCookStartRef,
  } = refs;

  function handsFreePhaseActive(status: string | null | undefined) {
    return status === "prep" || status === "cooking";
  }

  function shouldArmMic() {
    if (busyRef.current || ttsSpeakingRef.current) return false;
    if (!handsFreePhaseActive(sessionStatusRef.current)) return false;
    return handsFreeRef.current || pendingHandsFreeAskRef.current;
  }

  function maybeShowBrowserVoiceHint() {
    if (browserHintShownRef.current || typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    const likelyMetaMask = /MetaMaskMobile/i.test(ua) || /MetaMask/i.test(ua);
    const noTts = typeof window !== "undefined" && !window.speechSynthesis;
    if (!likelyMetaMask && !noTts) return;
    browserHintShownRef.current = true;
    pushRef.current({
      role: "agent",
      text:
        replyLangRef.current === "en"
          ? "Tip: agent voice + hands-free mic work best in Chrome or the installed PWA (MetaMask’s in-app browser is limited)."
          : "Tips: suara agent + hands-free mic lebih lancar di Chrome atau PWA terpasang (browser dalam MetaMask terbatas).",
      kind: "text",
    });
  }

  function canGetUserMedia(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
    );
  }

  /**
   * Request mic once on a user gesture, then release the stream immediately.
   * Holding getUserMedia open blocks SpeechRecognition on Android Chrome/PWA.
   */
  async function ensureMicPermission(): Promise<boolean> {
    if (micPermissionOkRef.current) return true;
    if (!canGetUserMedia()) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const track of stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
      micPermissionOkRef.current = true;
      return true;
    } catch {
      micPermissionOkRef.current = false;
      setHandsFree(false);
      handsFreeRef.current = false;
      setPendingHandsFreeAsk(false);
      pendingHandsFreeAskRef.current = false;
      stopMicInternal();
      setErrorRef.current(
        replyLangRef.current === "en"
          ? "Allow the microphone once to use hands-free (or type instead)."
          : "Izinkan mikrofon sekali untuk hands-free (atau ketik saja).",
      );
      return false;
    }
  }

  function speakAgent(text: string, lang: "id" | "en" = replyLangRef.current) {
    const plain = plainForSpeech(text);
    ttsSpeakingRef.current = true;
    setTtsSpeaking(true);
    stopMicInternal();
    if (plain) {
      speakText(plain, ttsLangFor(lang), () => {
        ttsSpeakingRef.current = false;
        setTtsSpeaking(false);
        if (shouldArmMic()) scheduleRearm(1200);
      });
    } else {
      ttsSpeakingRef.current = false;
      setTtsSpeaking(false);
      if (shouldArmMic()) scheduleRearm(200);
    }
  }

  function stopMicInternal() {
    if (rearmTimerRef.current) {
      clearTimeout(rearmTimerRef.current);
      rearmTimerRef.current = null;
    }
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  }

  function scheduleRearm(ms = 300) {
    if (rearmTimerRef.current) clearTimeout(rearmTimerRef.current);
    rearmTimerRef.current = setTimeout(() => {
      rearmTimerRef.current = null;
      if (shouldArmMic()) void startMicLoop();
    }, ms);
  }

  async function startMicLoop() {
    if (!micSupported) return;
    if (busyRef.current || ttsSpeakingRef.current) return;
    if (recRef.current) return;

    if (canGetUserMedia() && !micPermissionOkRef.current) {
      const ok = await ensureMicPermission();
      if (!ok) return;
    }
    if (recRef.current) return;

    const rec = createSpeechRecognition({ continuous: false });
    if (!rec) {
      setErrorRef.current("Voice tidak didukung di browser ini — ketik saja.");
      setHandsFree(false);
      handsFreeRef.current = false;
      return;
    }
    recRef.current = rec;
    setListening(true);
    setErrorRef.current("");
    rec.onresult = (ev) => {
      const soft = transcriptFromRecognitionResults(ev.results);
      if (soft) {
        stopMicInternal();
        onTranscriptRef.current(soft);
      }
    };
    rec.onerror = (ev) => {
      setListening(false);
      recRef.current = null;
      const code = ev?.error ?? "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        micPermissionOkRef.current = false;
        setHandsFree(false);
        handsFreeRef.current = false;
        setErrorRef.current(
          replyLangRef.current === "en"
            ? "Microphone blocked — allow mic in browser settings, or type."
            : "Mikrofon diblokir — izinkan mic di pengaturan browser, atau ketik.",
        );
        return;
      }
      if (code === "audio-capture") {
        setErrorRef.current(
          replyLangRef.current === "en"
            ? "Mic busy or unavailable — try again, or type."
            : "Mic sibuk / tidak tersedia — coba lagi, atau ketik.",
        );
        if (shouldArmMic()) scheduleRearm(1000);
        return;
      }
      // no-speech / aborted: quiet re-arm in hands-free
      if (shouldArmMic()) {
        scheduleRearm(600);
      } else if (!handsFreeRef.current && !pendingHandsFreeAskRef.current) {
        setErrorRef.current("Mic error — ketik perintah di chat.");
      }
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (shouldArmMic()) scheduleRearm(300);
    };
    try {
      rec.start();
    } catch {
      setListening(false);
      recRef.current = null;
      if (shouldArmMic()) scheduleRearm(500);
      else setErrorRef.current("Tidak bisa mulai mic — ketik saja.");
    }
  }

  async function enableHandsFree() {
    maybeShowBrowserVoiceHint();
    const ok = await ensureMicPermission();
    if (!ok) return;
    setPendingHandsFreeAsk(false);
    pendingHandsFreeAskRef.current = false;
    setHandsFree(true);
    handsFreeRef.current = true;
    if (!ttsSpeakingRef.current && !busyRef.current) void startMicLoop();
  }

  function disableHandsFree() {
    setHandsFree(false);
    handsFreeRef.current = false;
    stopMicInternal();
  }

  function resetHandsFreeAndMic() {
    disableHandsFree();
    setPendingHandsFreeAsk(false);
    pendingHandsFreeAskRef.current = false;
    pendingCookStartRef.current = null;
    handsFreeAskedSessionRef.current = null;
    stopSpeaking();
    ttsSpeakingRef.current = false;
    setTtsSpeaking(false);
  }

  function resolveHandsFreeAsk(enable: boolean) {
    setPendingHandsFreeAsk(false);
    pendingHandsFreeAskRef.current = false;
    const sid = sessionRef.current?.id;
    if (sid) handsFreeAskedSessionRef.current = sid;

    void (async () => {
      if (enable) {
        maybeShowBrowserVoiceHint();
        const ok = await ensureMicPermission();
        if (!ok) return;
        setHandsFree(true);
        handsFreeRef.current = true;
      } else {
        setHandsFree(false);
        handsFreeRef.current = false;
        stopMicInternal();
      }

      const flushed = flushPendingRef.current();
      if (!flushed) {
        const lang = replyLangRef.current;
        const text = enable
          ? lang === "en"
            ? "Hands-free **on**. Say lanjut / balik / ulang when ready."
            : "Hands-free **on**. Bilang lanjut / balik / ulang kalau siap."
          : lang === "en"
            ? "Hands-free **off**. Tap the mic when you want to speak, or type."
            : "Hands-free **off**. Ketuk mic kalau mau bicara, atau ketik.";
        pushRef.current({ role: "agent", text, kind: "text" });
        if (enable && !ttsSpeakingRef.current && !busyRef.current) {
          void startMicLoop();
        }
      }
    })();
  }

  function askHandsFreeOnce(sessionId: string) {
    if (handsFreeAskedSessionRef.current === sessionId) return;
    handsFreeAskedSessionRef.current = sessionId;
    setPendingHandsFreeAsk(true);
    pendingHandsFreeAskRef.current = true;
    disableHandsFree();
    const text =
      replyLangRef.current === "en"
        ? "Hands-free mic on? Say **yes** / **no**, or use **Hands-free On/Off**."
        : "Hands-free mic on? Bilang **ya** / **tidak**, atau pakai tombol **Hands-free On/Off**.";
    pushRef.current({ role: "agent", text, kind: "text" });
    speakAgent(text);
  }

  function toggleMic() {
    const live = sessionRef.current;
    if (live && (live.status === "prep" || live.status === "cooking")) {
      if (pendingHandsFreeAskRef.current) {
        void startMicLoop();
        return;
      }
      if (handsFreeRef.current) disableHandsFree();
      else {
        handsFreeAskedSessionRef.current = live.id;
        void enableHandsFree();
      }
      return;
    }
    void startMicLoop();
  }

  function stopTts() {
    stopSpeaking();
    ttsSpeakingRef.current = false;
    setTtsSpeaking(false);
    if (shouldArmMic()) scheduleRearm(300);
  }

  useEffect(() => {
    if (!session) {
      disableHandsFree();
      return;
    }
    if (session.status !== "prep" && session.status !== "cooking") {
      resetHandsFreeAndMic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, session?.id]);

  useEffect(() => {
    if (busy) {
      stopMicInternal();
    } else if (shouldArmMic() && !ttsSpeakingRef.current) {
      scheduleRearm(500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  useEffect(() => {
    return () => stopMicInternal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    listening,
    handsFree,
    pendingHandsFreeAsk,
    ttsSpeaking,
    micSupported,
    speakAgent,
    scheduleRearm,
    resetHandsFreeAndMic,
    askHandsFreeOnce,
    resolveHandsFreeAsk,
    toggleMic,
    stopTts,
  };
}
