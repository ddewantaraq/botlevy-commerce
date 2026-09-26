export function nid() {
  return `m_${Math.random().toString(36).slice(2, 10)}`;
}

export function detectUiLang(text: string): "id" | "en" {
  const t = text.trim();
  const id =
    (t.match(
      /\b(aku|saya|punya|cuma|cuman|enak|masak|bahan|mau|tidak|nggak|iya|ya|menu|resep|belanja|sendiri|cek\s+harga|harga\s+warung)\b/gi,
    ) || []).length;
  // "quote" is bilingual / command — do not let it alone force English
  const en =
    (t.match(
      /\b(i\s+have|only\s+have|what\s+can|cook|recipe|ingredients|please|want\s+quote|start\s+cooking|dish)\b/gi,
    ) || []).length;
  if (en > id) return "en";
  if (id > 0) return "id";
  return "id";
}

/** Short bilingual commands — keep prior replyLang (don't flip on bare "quote"). */
export function isStickyLangUtterance(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[.…,!?？！。、;:"""''`~]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return true;
  return (
    /^(quote|quotes|mau quote|want quote|cek harga|minta harga|ambil harga|harga warung|mau cek harga)$/.test(
      t,
    ) ||
    /^(ya|iya|tidak|nggak|gak|yes|no|ok|oke|okay|lanjut|balik|ulang|mulai|mulai masak|belanja sendiri|beli sendiri|langsung|batal|cancel)$/.test(
      t,
    ) ||
    /^(quote|cek harga|mau quote|want quote|minta harga)\s+(aja|dong|deh|lah|ya|please)$/.test(
      t,
    )
  );
}

export function resolveUiLang(text: string, prev: "id" | "en"): "id" | "en" {
  if (isStickyLangUtterance(text)) return prev;
  return detectUiLang(text);
}

export function plainForSpeech(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/[#>`]/g, "")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ttsLangFor(lang: "id" | "en"): string {
  return lang === "en" ? "en-US" : "id-ID";
}
