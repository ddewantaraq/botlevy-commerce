/** Detect reply language from user text (Bahasa vs English). */

export type ReplyLang = "id" | "en";

const BAHASA_CUES =
  /\b(aku|saya|punya|cuma|cuman|enak|masak|bahan|mau|tidak|nggak|iya|ya|dengan|dari|yang|untuk|menu|resep|belanja|sendiri|sebutkan|kurang|sudah|benar|quote)\b/i;

const ENGLISH_CUES =
  /\b(i\s+have|only\s+have|what\s+can|cook|recipe|ingredients|please|yes|no|want|need|quote|myself|suggest|dish|menu)\b/i;

export function detectReplyLang(text: string): ReplyLang {
  const t = text.trim();
  if (!t) return "id";
  const idScore = (t.match(BAHASA_CUES) || []).length;
  const enScore = (t.match(ENGLISH_CUES) || []).length;
  if (enScore > idScore) return "en";
  if (idScore > 0) return "id";
  // Latin-only short English-ish defaults
  if (/^[a-z0-9\s',.!?-]+$/i.test(t) && /\b(the|a|an|to|for|with)\b/i.test(t)) {
    return "en";
  }
  return "id";
}

export function ttsLang(lang: ReplyLang): string {
  return lang === "en" ? "en-US" : "id-ID";
}

export function pickCopy(
  lang: ReplyLang,
  id: string,
  en: string,
): string {
  return lang === "en" ? en : id;
}
