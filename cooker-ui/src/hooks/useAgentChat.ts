import { useEffect, useRef, useState } from "react";
import { useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { bscTestnet } from "wagmi/chains";
import {
  API_URL,
  MOCK_USDC_ADDRESS,
  MOCK_USDC_ABI,
  config,
} from "@botlevy-commerce/shared";
import { isNoUtterance, isYesUtterance } from "../lib/agent-chat";
import {
  runPlanning,
  sendSessionMessage,
  type AgentRunDeps,
} from "../lib/agent-runs";
import { nid, resolveUiLang } from "../lib/chat-lang";
import type { ChatMessage, CookingSession, Plan, Quote } from "../types/chat";
import {
  isActiveCookStatus,
  type CookerChatRefs,
  type PendingCookStart,
} from "./useCookerChatRefs";

type MicApi = {
  micSupported: boolean;
  speakAgent: (text: string, lang?: "id" | "en") => void;
  scheduleRearm: (ms?: number) => void;
  askHandsFreeOnce: (sessionId: string) => void;
  resolveHandsFreeAsk: (enable: boolean) => void;
};

type SessionApi = {
  session: CookingSession | null;
  applySession: (session: CookingSession | null) => void;
  clearCookSession: (opts?: { abandon?: boolean }) => void;
  ensureActiveSession: () => Promise<CookingSession | null>;
  startPrep: (runId: string) => Promise<void>;
  stashOrSpeakIntro: (intro: PendingCookStart, runId?: string) => void;
};

type Opts = {
  refs: CookerChatRefs;
  signedIn: boolean;
  address: `0x${string}` | undefined;
  wrongChain: boolean;
  mic: MicApi;
  cookSession: SessionApi;
};

export function useAgentChat({
  refs,
  signedIn,
  address,
  wrongChain,
  mic,
  cookSession,
}: Opts) {
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending: paying } = useWriteContract();

  const [pantry, setPantry] = useState<string[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: nid(),
      role: "agent",
      text: "Hai — aku asisten masak Botlevy. Ceritakan mau masak apa, atau bahan apa yang ada di dapur (mis. “cuma punya daging sapi, enak masak apa ya?”).",
      at: new Date().toISOString(),
      kind: "text",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [replyLang, setReplyLang] = useState<"id" | "en">("id");
  const [confirmingPay, setConfirmingPay] = useState(false);

  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;

  const {
    bottomRef,
    busyRef,
    sessionRef,
    replyLangRef,
    messagesRef,
    pendingHandsFreeAskRef,
    pendingCookStartRef,
    handsFreeAskedSessionRef,
  } = refs;

  busyRef.current = busy;
  messagesRef.current = messages;
  replyLangRef.current = replyLang;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, bottomRef]);

  function push(msg: Omit<ChatMessage, "id" | "at">) {
    setMessages((m) => [
      ...m,
      { ...msg, id: nid(), at: new Date().toISOString() },
    ]);
  }

  function pushAgent(msg: Omit<ChatMessage, "id" | "at" | "role">) {
    push({ ...msg, role: "agent" });
    mic.speakAgent(msg.text);
  }

  function runDeps(): AgentRunDeps {
    return {
      pantry,
      replyLangRef,
      setReplyLang,
      sessionRef,
      handsFreeAskedSessionRef,
      pendingCookStartRef,
      micSupported: mic.micSupported,
      speakAgent: (text) => mic.speakAgent(text),
      askHandsFreeOnce: mic.askHandsFreeOnce,
      applySession: cookSession.applySession,
      clearCookSession: cookSession.clearCookSession,
      stashOrSpeakIntro: cookSession.stashOrSpeakIntro,
      push,
      pushAgent,
    };
  }

  async function handleSend(raw?: string) {
    const text = (raw ?? draft).trim();
    // Use refs — SpeechRecognition may call a closure from an older render.
    if (!text || busyRef.current) return;
    if (!signedInRef.current) {
      setError("SIWE login as cooker first");
      return;
    }

    const live = sessionRef.current;
    if (
      pendingHandsFreeAskRef.current &&
      (isActiveCookStatus(live?.status) || pendingCookStartRef.current)
    ) {
      setDraft("");
      setError("");
      push({ role: "user", text, kind: "text" });
      if (isYesUtterance(text)) {
        mic.resolveHandsFreeAsk(true);
        return;
      }
      if (isNoUtterance(text)) {
        mic.resolveHandsFreeAsk(false);
        return;
      }
      push({
        role: "agent",
        text:
          replyLangRef.current === "en"
            ? "Please say **yes** or **no** for hands-free mic (or use On/Off)."
            : "Bilang **ya** atau **tidak** untuk hands-free mic (atau pakai On/Off).",
        kind: "text",
      });
      if (mic.micSupported) mic.scheduleRearm(400);
      return;
    }

    setDraft("");
    setError("");
    {
      const lang = resolveUiLang(text, replyLangRef.current);
      replyLangRef.current = lang;
      setReplyLang(lang);
    }
    push({ role: "user", text, kind: "text" });
    setBusy(true);
    busyRef.current = true;
    try {
      const deps = runDeps();
      let active = sessionRef.current;
      if (!active || !isActiveCookStatus(active.status)) {
        active = await cookSession.ensureActiveSession();
      }
      if (active && isActiveCookStatus(active.status)) {
        await sendSessionMessage(deps, text);
      } else {
        const lastSuggest = [...messagesRef.current]
          .reverse()
          .find((m) => m.role === "agent" && (m.suggestions?.length ?? 0) > 0);
        const matched = lastSuggest?.suggestions?.find((s) => {
          const g = text.toLowerCase();
          const d = s.dish.toLowerCase();
          return g === d || g.includes(d) || d.includes(g);
        });
        if (matched) await runPlanning(deps, text, matched.dish);
        else await runPlanning(deps, text);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
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
      await runPlanning(runDeps(), goal, dish);
    } finally {
      setBusy(false);
    }
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
      if (runId) await cookSession.startPrep(runId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConfirmingPay(false);
    }
  }

  async function saveMenu(plan: Plan) {
    const { session } = cookSession;
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
        cookSession.clearCookSession();
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

  return {
    pantry,
    setPantry,
    messages,
    draft,
    setDraft,
    busy,
    setBusy,
    error,
    setError,
    replyLang,
    confirmingPay,
    paying,
    push,
    handleSend,
    pickDish,
    payQuote,
    saveMenu,
  };
}
