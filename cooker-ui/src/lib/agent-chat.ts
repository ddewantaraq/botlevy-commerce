import type { ChatMessage } from "../types/chat";

export function isYesUtterance(t: string) {
  const n = t.trim().toLowerCase().replace(/[.…,!?]+$/g, "").trim();
  return /^(ya+|y+|yes|iya+h?|ok+|oke+|okay|sip|yup|yeah)$/.test(n);
}

export function isNoUtterance(t: string) {
  const n = t.trim().toLowerCase().replace(/[.…,!?]+$/g, "").trim();
  return /^(tidak|tdk|nggak|nga+k|gak|enggak|no+|jangan)$/.test(n);
}

export function clarifyFallback(status: string, lang: "id" | "en") {
  if (status === "ask_bahan") {
    return lang === "en"
      ? "List the ingredients you already have."
      : "Sebutkan bahan yang sudah kamu punya.";
  }
  if (status === "ask_quote") {
    return lang === "en" ? "Want a warung quote?" : "Mau cek harga dari warung?";
  }
  if (status === "idle") {
    return lang === "en"
      ? "Ready — say start cooking or want quote."
      : "Siap — bilang mulai masak atau cek harga.";
  }
  if (status === "confirm_gap") {
    return lang === "en" ? "Is that correct?" : "Apakah sudah benar?";
  }
  if (status === "ask_reset") {
    return lang === "en"
      ? "Start a new chat? Say yes or no."
      : "Yakin mulai chat baru? Bilang ya atau tidak.";
  }
  return lang === "en"
    ? "Want to start a new cooking plan?"
    : "Mau mulai rencana masak baru?";
}

export function planResultText(
  data: { status?: string; message?: string; plan?: { dish?: string } },
  lang: "id" | "en",
) {
  if (data.status === "suggestions") {
    return lang === "en"
      ? "Some dish ideas from your ingredients — pick one:"
      : "Beberapa ide menu dari bahanmu — pilih salah satu:";
  }
  if (data.status === "cookable") {
    return lang === "en"
      ? `Recipe **${data.plan?.dish}** is ready. You have everything — start pre-cook?`
      : `Resep **${data.plan?.dish}** siap. Semua bahan sudah ada — mulai pre-cook?`;
  }
  if (data.status === "quoted") {
    return lang === "en"
      ? `Recipe **${data.plan?.dish}**. Missing items — warung quote ready to pay.`
      : `Resep **${data.plan?.dish}**. Ada bahan kurang — harga warung siap dibayar.`;
  }
  return data.message || `Status: ${data.status}`;
}

export function sessionReplyKind(data: {
  prepStep?: unknown;
  cookStep?: unknown;
  session: { status: string; prepGuide?: string };
}): ChatMessage["kind"] {
  if (data.prepStep) return "prep_step";
  if (data.cookStep) return "cook_step";
  if (data.session.status === "prep" && data.session.prepGuide === "free") {
    return "prep";
  }
  if (data.session.status === "prep" && data.session.prepGuide === "ask") {
    return "prep_ask";
  }
  return "text";
}
