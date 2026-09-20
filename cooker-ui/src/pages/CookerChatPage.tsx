import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { bscTestnet } from "wagmi/chains";
import {
  API_URL,
  CHAIN_ID,
  MOCK_USDC_ADDRESS,
  MOCK_USDC_ABI,
  config,
  createSpeechRecognition,
  formatMusdc,
  isSpeechRecognitionSupported,
  siweLogin,
  siweLogout,
  speakText,
  stopSpeaking,
  transcriptFromRecognitionResults,
} from "@botlevy-commerce/shared";
import { MicIcon } from "../components/MicIcon";

type Quote = {
  id: string;
  merchantId: string;
  merchantName: string;
  payTo: string;
  total: number;
  lines: Array<{ name: string; qty: number; unitPrice: number; tag: string }>;
  substitutions?: Array<{ fromTag: string; toTag: string; reason: string }>;
};

type Plan = {
  dish: string;
  steps: string[];
  ingredients: Array<{ tag: string; name: string; qty: number; unit: string }>;
};

type Suggestion = { dish: string; reason: string; ingredientsPreview?: string[] };

type CookingSession = {
  id: string;
  status: "prep" | "cooking" | "post_cook" | "done" | "abandoned";
  dish: string;
  plan: Plan;
  prepChecks: Record<string, boolean>;
  stepIndex: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  at: string;
  kind?: "text" | "plan_result" | "prep" | "cook_step";
  status?: string;
  intent?: string;
  suggestions?: Suggestion[];
  plan?: Plan;
  quote?: Quote;
  steps?: Array<{ tool: string; result?: unknown; error?: string }>;
  runId?: string;
  cookStep?: { index: number; total: number; text: string };
  sessionId?: string;
  prepChecks?: Record<string, boolean>;
};

function nid() {
  return `m_${Math.random().toString(36).slice(2, 10)}`;
}

function detectUiLang(text: string): "id" | "en" {
  const t = text.trim();
  const id =
    (t.match(
      /\b(aku|saya|punya|cuma|enak|masak|bahan|mau|tidak|nggak|iya|ya|menu|resep)\b/gi,
    ) || []).length;
  const en =
    (t.match(
      /\b(i\s+have|only|what|cook|recipe|ingredients|yes|no|want|quote|dish)\b/gi,
    ) || []).length;
  return en > id ? "en" : "id";
}

function plainForSpeech(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/[#>`]/g, "")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function ttsLangFor(lang: "id" | "en"): string {
  return lang === "en" ? "en-US" : "id-ID";
}

export function CookerChatPage() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync, isPending: paying } = useWriteContract();

  const [cookerAddress, setCookerAddress] = useState("");
  const [pantry, setPantry] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: nid(),
      role: "agent",
      text: "Hai — aku asisten masak Botlevy. Ceritakan mau masak apa, atau bahan apa yang ada di dapur (mis. “cuma punya daging sapi, enak apa?”).",
      at: new Date().toISOString(),
      kind: "text",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [pendingHandsFreeAsk, setPendingHandsFreeAsk] = useState(false);
  const [ttsSpeaking, setTtsSpeaking] = useState(false);
  const [replyLang, setReplyLang] = useState<"id" | "en">("id");
  const [session, setSession] = useState<CookingSession | null>(null);
  const [confirmingPay, setConfirmingPay] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const handsFreeRef = useRef(false);
  const busyRef = useRef(false);
  const ttsSpeakingRef = useRef(false);
  const pendingHandsFreeAskRef = useRef(false);
  const handsFreeAskedSessionRef = useRef<string | null>(null);
  const sessionStatusRef = useRef<string | null>(null);
  const recRef = useRef<ReturnType<typeof createSpeechRecognition>>(null);
  const rearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCookStartRef = useRef<{
    reply: string;
    speak?: string;
    cookStep?: ChatMessage["cookStep"];
    prepChecks?: Record<string, boolean>;
    plan?: Plan;
    sessionId: string;
  } | null>(null);
  const micSupported = isSpeechRecognitionSupported();

  // busy/sessionStatus: sync from state. handsFree / pendingHandsFreeAsk: refs are source of truth
  busyRef.current = busy;
  sessionStatusRef.current = session?.status ?? null;

  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const signedIn =
    !!cookerAddress &&
    !!address &&
    cookerAddress.toLowerCase() === address.toLowerCase();

  const scrollDown = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollDown();
  }, [messages, busy]);

  const refreshSession = useCallback(async () => {
    const me = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
    if (!me.ok) {
      setCookerAddress("");
      return;
    }
    const data = await me.json();
    if (data.role === "cooker" && data.address) {
      setCookerAddress(data.address);
      const [p, s] = await Promise.all([
        fetch(`${API_URL}/cooker/pantry`, { credentials: "include" }),
        fetch(`${API_URL}/cooker/sessions/active`, { credentials: "include" }),
      ]);
      if (p.ok) {
        const pj = await p.json();
        setPantry(pj.pantry ?? []);
      }
      if (s.ok) {
        const sj = await s.json();
        setSession(sj.session ?? null);
      }
    } else setCookerAddress("");
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  async function login() {
    setBusy(true);
    setError("");
    try {
      if (wrongChain) await switchChain({ chainId: bscTestnet.id });
      if (!address) throw new Error("Connect wallet first");
      const data = await siweLogin({
        address,
        role: "cooker",
        statement: "Sign in to Botlevy Cooker",
        signMessageAsync,
      });
      setCookerAddress(data.address);
      await refreshSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await siweLogout();
    setCookerAddress("");
    setSession(null);
    disconnect();
  }

  function push(msg: Omit<ChatMessage, "id" | "at">) {
    setMessages((m) => [
      ...m,
      { ...msg, id: nid(), at: new Date().toISOString() },
    ]);
  }

  function isYesUtterance(t: string) {
    const n = t.trim().toLowerCase().replace(/[.…,!?]+$/g, "").trim();
    return /^(ya+|y+|yes|iya+h?|ok+|oke+|okay|sip|yup|yeah)$/.test(n);
  }

  function isNoUtterance(t: string) {
    const n = t.trim().toLowerCase().replace(/[.…,!?]+$/g, "").trim();
    return /^(tidak|tdk|nggak|nga+k|gak|enggak|no+|jangan)$/.test(n);
  }

  /** Hands-free only during cooking (not prep). */
  function handsFreePhaseActive(status: string | null | undefined) {
    return status === "cooking";
  }

  /** Arm mic when hands-free is on, or while waiting for ya/tidak. */
  function shouldArmMic() {
    if (busyRef.current || ttsSpeakingRef.current) return false;
    if (!handsFreePhaseActive(sessionStatusRef.current)) return false;
    return handsFreeRef.current || pendingHandsFreeAskRef.current;
  }

  function speakAgent(text: string, lang: "id" | "en" = replyLang) {
    const plain = plainForSpeech(text);
    // Mute mic while agent speaks — avoid capturing TTS as user input
    ttsSpeakingRef.current = true;
    setTtsSpeaking(true);
    stopMicInternal();
    if (plain) {
      speakText(plain, ttsLangFor(lang), () => {
        ttsSpeakingRef.current = false;
        setTtsSpeaking(false);
        if (shouldArmMic()) scheduleRearm(600);
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
      if (shouldArmMic()) startMicLoop();
    }, ms);
  }

  function startMicLoop() {
    if (!micSupported) return;
    if (busyRef.current || ttsSpeakingRef.current) return;
    if (recRef.current) return;

    const rec = createSpeechRecognition({ continuous: false });
    if (!rec) {
      setError("Voice tidak didukung di browser ini — ketik saja.");
      setHandsFree(false);
      handsFreeRef.current = false;
      return;
    }
    recRef.current = rec;
    setListening(true);
    setError("");
    rec.onresult = (ev) => {
      const soft = transcriptFromRecognitionResults(ev.results);
      if (soft) {
        stopMicInternal();
        void handleSend(soft);
      }
    };
    rec.onerror = () => {
      setListening(false);
      recRef.current = null;
      if (shouldArmMic()) {
        scheduleRearm(600);
      } else if (!handsFreeRef.current && !pendingHandsFreeAskRef.current) {
        setError("Mic error — ketik perintah di chat.");
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
      else setError("Tidak bisa mulai mic — ketik saja.");
    }
  }

  function enableHandsFree() {
    setPendingHandsFreeAsk(false);
    pendingHandsFreeAskRef.current = false;
    setHandsFree(true);
    handsFreeRef.current = true;
    if (!ttsSpeakingRef.current && !busyRef.current) {
      startMicLoop();
    }
  }

  function disableHandsFree() {
    setHandsFree(false);
    handsFreeRef.current = false;
    stopMicInternal();
  }

  function flushPendingCookStart() {
    const stashed = pendingCookStartRef.current;
    pendingCookStartRef.current = null;
    if (!stashed) return false;
    push({
      role: "agent",
      text: stashed.reply,
      kind: stashed.cookStep ? "cook_step" : "text",
      cookStep: stashed.cookStep,
      sessionId: stashed.sessionId,
      prepChecks: stashed.prepChecks,
      plan: stashed.plan,
    });
    speakAgent(stashed.speak || stashed.reply);
    return true;
  }

  /** Apply hands-free choice, then show the stashed first cook step (if any). */
  function resolveHandsFreeAsk(enable: boolean) {
    setPendingHandsFreeAsk(false);
    pendingHandsFreeAskRef.current = false;
    if (session?.id) handsFreeAskedSessionRef.current = session.id;

    setHandsFree(enable);
    handsFreeRef.current = enable;
    if (!enable) stopMicInternal();

    const flushed = flushPendingCookStart();
    if (!flushed) {
      const text = enable
        ? replyLang === "en"
          ? "Hands-free **on**. Say lanjut / balik / ulang when ready."
          : "Hands-free **on**. Bilang lanjut / balik / ulang kalau siap."
        : replyLang === "en"
          ? "Hands-free **off**. Tap the mic when you want to speak, or type."
          : "Hands-free **off**. Ketuk mic kalau mau bicara, atau ketik.";
      push({ role: "agent", text, kind: "text" });
      if (enable && !ttsSpeakingRef.current && !busyRef.current) {
        startMicLoop();
      }
    }
    // If flushed: speakAgent mutes mic and re-arms after TTS when handsFree
  }

  function askHandsFreeOnce(sessionId: string) {
    if (handsFreeAskedSessionRef.current === sessionId) return;
    handsFreeAskedSessionRef.current = sessionId;
    setPendingHandsFreeAsk(true);
    pendingHandsFreeAskRef.current = true;
    disableHandsFree();
    const text =
      replyLang === "en"
        ? "Hands-free mic while cooking? Say **yes** / **no**, or use **Hands-free On/Off**."
        : "Hands-free mic saat masak? Bilang **ya** / **tidak**, atau pakai tombol **Hands-free On/Off**.";
    push({ role: "agent", text, kind: "text" });
    speakAgent(text);
  }

  function toggleMic() {
    if (session?.status === "cooking") {
      if (pendingHandsFreeAskRef.current) {
        startMicLoop();
        return;
      }
      if (handsFreeRef.current) disableHandsFree();
      else {
        handsFreeAskedSessionRef.current = session.id;
        enableHandsFree();
      }
      return;
    }
    startMicLoop();
  }

  // Leaving cooking / session end → clear hands-free + any stashed step
  useEffect(() => {
    if (!session) {
      handsFreeAskedSessionRef.current = null;
      pendingCookStartRef.current = null;
      setPendingHandsFreeAsk(false);
      pendingHandsFreeAskRef.current = false;
      if (handsFreeRef.current) disableHandsFree();
      return;
    }
    if (session.status !== "cooking") {
      pendingCookStartRef.current = null;
      setPendingHandsFreeAsk(false);
      pendingHandsFreeAskRef.current = false;
      if (handsFreeRef.current) disableHandsFree();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, session?.id]);

  // Pause mic while busy; re-arm when free (cooking hands-free or ya/tidak ask)
  useEffect(() => {
    if (busy) {
      stopMicInternal();
    } else if (shouldArmMic()) {
      scheduleRearm(400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  useEffect(() => {
    return () => stopMicInternal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushAgent(msg: Omit<ChatMessage, "id" | "at" | "role">) {
    push({ ...msg, role: "agent" });
    speakAgent(msg.text);
  }

  async function runPlanning(goal: string, selectedDish?: string) {
    const lang = detectUiLang(goal);
    setReplyLang(lang);
    const res = await fetch(`${API_URL}/agent/runs`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal,
        pantry,
        ...(selectedDish ? { selectedDish } : {}),
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      pushAgent({
        text: data.message || (lang === "en" ? "Agent run failed" : "Agent gagal"),
        kind: "text",
        steps: data.steps,
      });
      return;
    }

    if (data.status === "prep" && data.session) {
      setSession(data.session);
      pushAgent({
        text: data.reply || data.message || "Prep",
        kind: "prep",
        sessionId: data.session.id,
        prepChecks: data.session.prepChecks,
        plan: data.session.plan,
        runId: data.runId,
      });
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
      pushAgent({
        text:
          data.message ||
          (data.status === "ask_bahan"
            ? lang === "en"
              ? "List the ingredients you already have."
              : "Sebutkan bahan yang sudah kamu punya."
            : data.status === "ask_quote"
              ? lang === "en"
                ? "Want a warung quote?"
                : "Mau quote dari warung?"
              : data.status === "idle"
                ? lang === "en"
                  ? "Ready — say start cooking or want quote."
                  : "Siap — bilang mulai masak atau mau quote."
                : data.status === "confirm_gap"
                  ? lang === "en"
                    ? "Is that correct?"
                    : "Apakah sudah benar?"
                  : data.status === "ask_reset"
                    ? lang === "en"
                      ? "Start a new chat? Say yes or no."
                      : "Yakin mulai chat baru? Bilang ya atau tidak."
                    : lang === "en"
                      ? "Want to start a new cooking plan?"
                      : "Mau mulai rencana masak baru?"),
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

    let text = "";
    if (data.status === "suggestions") {
      text =
        lang === "en"
          ? "Some dish ideas from your ingredients — pick one:"
          : "Beberapa ide menu dari bahanmu — pilih salah satu:";
    } else if (data.status === "cookable") {
      text =
        lang === "en"
          ? `Recipe **${data.plan?.dish}** is ready. You have everything — start pre-cook?`
          : `Resep **${data.plan?.dish}** siap. Semua bahan sudah ada — mulai pre-cook?`;
    } else if (data.status === "quoted") {
      text =
        lang === "en"
          ? `Recipe **${data.plan?.dish}**. Missing items — warung quote ready to pay.`
          : `Resep **${data.plan?.dish}**. Ada bahan kurang — quote warung siap dibayar.`;
    } else {
      text = data.message || `Status: ${data.status}`;
    }

    pushAgent({
      text,
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

  async function sendSessionMessage(text: string) {
    if (!session) return;
    const wasCooking = session.status === "cooking";
    const res = await fetch(`${API_URL}/cooker/sessions/${session.id}/message`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      pushAgent({ text: data.message || "Session message failed", kind: "text" });
      return;
    }
    setSession(data.session);
    sessionStatusRef.current = data.session.status;

    const enteringCooking =
      data.session.status === "cooking" &&
      !wasCooking &&
      micSupported &&
      handsFreeAskedSessionRef.current !== data.session.id;

    if (enteringCooking) {
      // Ask hands-free first; stash step until ya/tidak / On/Off
      pendingCookStartRef.current = {
        reply: data.reply,
        speak: data.speak,
        cookStep: data.cookStep,
        prepChecks: data.session.prepChecks,
        plan: data.session.plan,
        sessionId: data.session.id,
      };
      askHandsFreeOnce(data.session.id);
    } else {
      const kind =
        data.cookStep
          ? "cook_step"
          : data.session.status === "prep"
            ? "prep"
            : "text";
      push({
        role: "agent",
        text: data.reply,
        kind,
        cookStep: data.cookStep,
        sessionId: data.session.id,
        prepChecks: data.session.prepChecks,
        plan: data.session.plan,
      });
      speakAgent(data.speak || data.reply);
    }

    if (data.handoff || data.session.status === "abandoned" || data.session.status === "done") {
      pendingCookStartRef.current = null;
      setSession(null);
    }
  }

  async function handleSend(raw?: string) {
    const text = (raw ?? draft).trim();
    if (!text || busy) return;
    if (!signedIn) {
      setError("SIWE login as cooker first");
      return;
    }

    // Hands-free opt-in — use ref so mic/typed answers never leak to cook API
    if (
      pendingHandsFreeAskRef.current &&
      (session?.status === "cooking" || pendingCookStartRef.current)
    ) {
      setDraft("");
      setError("");
      push({ role: "user", text, kind: "text" });
      if (isYesUtterance(text)) {
        resolveHandsFreeAsk(true);
        return;
      }
      if (isNoUtterance(text)) {
        resolveHandsFreeAsk(false);
        return;
      }
      push({
        role: "agent",
        text:
          replyLang === "en"
            ? "Please say **yes** or **no** for hands-free mic (or use On/Off)."
            : "Bilang **ya** atau **tidak** untuk hands-free mic (atau pakai On/Off).",
        kind: "text",
      });
      if (micSupported) scheduleRearm(400);
      return;
    }

    setDraft("");
    setError("");
    setReplyLang(detectUiLang(text));
    push({ role: "user", text, kind: "text" });
    setBusy(true);
    try {
      const active =
        session &&
        (session.status === "prep" ||
          session.status === "cooking" ||
          session.status === "post_cook");
      if (active) {
        await sendSessionMessage(text);
      } else {
        // UI fallback: match last suggestions like a click
        const lastSuggest = [...messages]
          .reverse()
          .find((m) => m.role === "agent" && (m.suggestions?.length ?? 0) > 0);
        const matched = lastSuggest?.suggestions?.find((s) => {
          const g = text.toLowerCase();
          const d = s.dish.toLowerCase();
          return g === d || g.includes(d) || d.includes(g);
        });
        if (matched) {
          await runPlanning(text, matched.dish);
        } else {
          await runPlanning(text);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function pickDish(dish: string, priorGoal?: string) {
    const goal =
      priorGoal ||
      [...messages].reverse().find((m) => m.role === "user")?.text ||
      `Saya mau masak ${dish}`;
    push({ role: "user", text: `Pilih: ${dish}`, kind: "text" });
    setBusy(true);
    try {
      await runPlanning(goal, dish);
    } finally {
      setBusy(false);
    }
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
      setSession(data.session);
      pushAgent({
        text: data.reply,
        kind: "prep",
        sessionId: data.session.id,
        prepChecks: data.session.prepChecks,
        plan: data.session.plan,
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
    if (data.ok) setSession(data.session);
  }

  async function payQuote(quote: Quote, runId?: string) {
    if (!address || !signedIn) return;
    if (!MOCK_USDC_ADDRESS) {
      setError("Set VITE_MOCK_USDC_ADDRESS");
      return;
    }
    setConfirmingPay(true);
    setError("");
    try {
      if (wrongChain) await switchChain({ chainId: bscTestnet.id });
      const hash = await writeContractAsync({
        address: MOCK_USDC_ADDRESS,
        abi: MOCK_USDC_ABI,
        functionName: "transfer",
        args: [quote.payTo as `0x${string}`, BigInt(quote.total)],
        chainId: bscTestnet.id,
      });
      await waitForTransactionReceipt(config, { hash });
      const res = await fetch(`${API_URL}/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id, txHash: hash }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Order failed");
      pushAgent({
        text:
          replyLang === "en"
            ? `Payment OK. Order **${data.order.id}**. Ready for pre-cook?`
            : `Pembayaran OK. Order **${data.order.id}**. Siap pre-cook?`,
        kind: "text",
      });
      if (runId) await startPrep(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirmingPay(false);
    }
  }

  async function saveMenu(plan: Plan) {
    if (
      session &&
      (session.status === "prep" ||
        session.status === "cooking" ||
        session.status === "post_cook")
    ) {
      const res = await fetch(`${API_URL}/cooker/sessions/${session.id}/save`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (data.ok) {
        pushAgent({
          text: data.reply || `Menu **${plan.dish}** tersimpan.`,
          kind: "text",
        });
        setSession(null);
        return;
      }
    }
    const res = await fetch(`${API_URL}/cooker/menus`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dish: plan.dish,
        plan,
        pantrySnapshot: pantry,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      pushAgent({
        text:
          replyLang === "en"
            ? `Menu **${plan.dish}** saved.`
            : `Menu **${plan.dish}** tersimpan.`,
        kind: "text",
      });
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="shrink-0 border-b border-[var(--line)] bg-[var(--canvas)]/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-[var(--ink)]">Botlevy Cooker</p>
            <p className="text-xs">
              {session
                ? `Sesi: ${session.status} · ${session.dish}${
                    session.status === "cooking" && handsFree
                      ? " · Hands-free on"
                      : session.status === "cooking" && pendingHandsFreeAsk
                        ? " · Hands-free?"
                        : ""
                  }`
                : "Chat · plan · pre-cook · cook-time"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isConnected ? (
              <button
                type="button"
                onClick={() => connect({ connector: connectors[0] })}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Connect
              </button>
            ) : (
              <>
                <span className="hidden font-mono text-[10px] sm:inline">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
                {wrongChain ? (
                  <button
                    type="button"
                    onClick={() => switchChain({ chainId: bscTestnet.id })}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Switch 97
                  </button>
                ) : signedIn ? (
                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs"
                  >
                    Logout
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void login()}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    SIWE
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                  m.role === "user"
                    ? "bg-[var(--bubble-user)] text-white"
                    : "border border-[var(--line)] bg-[var(--bubble-agent)] text-[var(--ink)]"
                }`}
              >
                {m.kind === "cook_step" && m.cookStep ? (
                  <div>
                    <p className="text-xs font-medium text-[var(--accent)]">
                      Langkah {m.cookStep.index + 1}/{m.cookStep.total}
                    </p>
                    <p className="mt-2 text-2xl font-semibold leading-snug tracking-tight">
                      {m.cookStep.text}
                    </p>
                    <p className="mt-3 text-xs text-[var(--body)]">
                      Mic atau ketik: lanjut · balik · ulang · selesai · ganti menu
                    </p>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                )}

                {m.kind === "prep" && m.prepChecks ? (
                  <ul className="mt-3 space-y-2">
                    {Object.entries(m.prepChecks).map(([tag, ok]) => {
                      const label =
                        (m.plan ?? session?.plan)?.ingredients.find(
                          (i) => i.tag.toLowerCase() === tag.toLowerCase(),
                        )?.name?.trim() || tag.replace(/_/g, " ");
                      return (
                        <li key={tag}>
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={session?.prepChecks?.[tag] ?? ok}
                              onChange={(e) =>
                                void togglePrepTag(tag, e.target.checked)
                              }
                            />
                            <span>{label}</span>
                          </label>
                        </li>
                      );
                    })}
                    <li className="pt-1 text-xs text-[var(--body)]">
                      Kalau semua bahan sudah siap, bilang atau ketik{" "}
                      <strong>mulai masak</strong>
                    </li>
                  </ul>
                ) : null}

                {m.suggestions?.length ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {m.suggestions.map((s) => (
                      <button
                        key={s.dish}
                        type="button"
                        disabled={busy}
                        onClick={() => void pickDish(s.dish)}
                        className="rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-3 py-2 text-left text-sm hover:border-[var(--accent)]"
                      >
                        <span className="font-semibold text-[var(--accent)]">
                          {s.dish}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--body)]">
                          {s.reason}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}

                {m.quote ? (
                  <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3 text-sm">
                    <p className="font-semibold">{m.quote.merchantName}</p>
                    <p>{formatMusdc(m.quote.total)} mUSDC</p>
                    <ul className="mt-1 text-xs">
                      {m.quote.lines.map((l) => (
                        <li key={`${l.tag}-${l.name}`}>
                          {l.name} × {l.qty}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={paying || confirmingPay || !signedIn}
                      onClick={() => void payQuote(m.quote!, m.runId)}
                      className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {paying || confirmingPay ? "Paying…" : "Pay with MockUSDC"}
                    </button>
                  </div>
                ) : null}

                {m.status === "cookable" && m.runId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void startPrep(m.runId!)}
                    className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white"
                  >
                    Siapkan bahan (pre-cook)
                  </button>
                ) : null}

                {m.plan &&
                (m.status === "cookable" ||
                  session?.status === "done" ||
                  session?.status === "post_cook" ||
                  m.kind === "cook_step" ||
                  m.kind === "prep") ? (
                  <button
                    type="button"
                    onClick={() => void saveMenu(m.plan!)}
                    className="mt-2 ml-0 block text-xs text-[var(--accent)] underline"
                  >
                    Simpan menu
                  </button>
                ) : null}

                {m.steps?.length ? (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-[var(--body)]">
                      Agent steps
                    </summary>
                    <ol className="mt-1 space-y-1 font-mono">
                      {m.steps.map((s, i) => (
                        <li key={`${s.tool}-${i}`}>
                          {s.tool}
                          {s.error ? ` — ${s.error}` : ""}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </div>
            </div>
          ))}
          {busy ? (
            <p className="text-center text-xs text-[var(--body)]">Agent berpikir…</p>
          ) : null}
          <div ref={bottomRef} />
        </div>

        {error ? (
          <p className="mx-4 mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="shrink-0 border-t border-[var(--line)] bg-[var(--canvas)]/95 px-4 py-3">
          {session?.status === "cooking" && micSupported ? (
            <div className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--body)]">Hands-free</span>
              <button
                type="button"
                disabled={!signedIn || busy}
                onClick={() => resolveHandsFreeAsk(true)}
                className={`rounded-lg px-2.5 py-1 font-semibold ${
                  !pendingHandsFreeAsk && handsFree
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--line)] bg-white text-[var(--ink)]"
                }`}
              >
                On
              </button>
              <button
                type="button"
                disabled={!signedIn || busy}
                onClick={() => resolveHandsFreeAsk(false)}
                className={`rounded-lg px-2.5 py-1 font-semibold ${
                  !pendingHandsFreeAsk && !handsFree
                    ? "bg-[var(--ink)] text-white"
                    : "border border-[var(--line)] bg-white text-[var(--ink)]"
                }`}
              >
                Off
              </button>
              {pendingHandsFreeAsk ? (
                <span className="text-[var(--body)]">Choose On or Off…</span>
              ) : listening ? (
                <span className="text-red-600">Listening…</span>
              ) : ttsSpeaking ? (
                <span className="text-[var(--body)]">Agent speaking…</span>
              ) : null}
            </div>
          ) : null}
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              rows={1}
              placeholder={
                signedIn
                  ? pendingHandsFreeAsk
                    ? "ya / tidak (hands-free)…"
                    : session?.status === "cooking"
                      ? "lanjut / balik / ulang / selesai…"
                      : "Pesan ke agent…"
                  : "Login dulu…"
              }
              disabled={!signedIn || busy}
              className="max-h-32 min-h-[44px] flex-1 resize-y rounded-2xl border border-[var(--line)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              title={
                !micSupported
                  ? "Voice tidak didukung"
                  : session?.status === "cooking"
                    ? handsFree
                      ? "Hands-free on — tap to turn off"
                      : "Hands-free off — tap to turn on"
                    : "Voice input (push-to-talk)"
              }
              aria-label={micSupported ? "Voice input" : "Voice tidak didukung"}
              aria-pressed={listening || handsFree}
              disabled={!signedIn || !micSupported || (busy && !handsFree)}
              onClick={() => toggleMic()}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${
                listening || handsFree
                  ? "animate-pulse border-red-400 bg-red-50 text-red-600"
                  : "border-[var(--line)] bg-white text-[var(--ink)]"
              } disabled:opacity-40`}
            >
              <MicIcon />
            </button>
            <button
              type="button"
              disabled={!signedIn || busy || !draft.trim()}
              onClick={() => void handleSend()}
              className="flex h-11 shrink-0 items-center rounded-full bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              ➤
            </button>
            <button
              type="button"
              title="Stop TTS"
              onClick={() => {
                stopSpeaking();
                ttsSpeakingRef.current = false;
                setTtsSpeaking(false);
                if (shouldArmMic()) scheduleRearm(300);
              }}
              className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white text-xs sm:flex"
            >
              🔇
            </button>
          </div>
          {pantry.length > 0 ? (
            <p className="mx-auto mt-2 max-w-3xl text-[10px] text-[var(--body)]">
              Pantry: {pantry.join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
