import type { Ingredient } from "../../store.js";

/** Normalize a free-text or chip token to snake_case tag. */
export function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Common ID/EN pantry aliases → canonical commerce tags. */
export const ALIAS_TO_CANONICAL: Record<string, string[]> = {
  ayam: ["chicken"],
  chicken: ["chicken"],
  daging_ayam: ["chicken"],
  beef: ["beef"],
  daging: ["beef"],
  daging_sapi: ["beef"],
  sapi: ["beef"],
  bawang: ["onion", "shallot"],
  bawang_bombay: ["onion"],
  onion: ["onion"],
  bawang_merah: ["shallot"],
  shallot: ["shallot"],
  bawang_putih: ["garlic"],
  garlic: ["garlic"],
  garam: ["salt"],
  salt: ["salt"],
  minyak: ["cooking_oil"],
  minyak_goreng: ["cooking_oil"],
  cooking_oil: ["cooking_oil"],
  oil: ["cooking_oil"],
  kunyit: ["turmeric"],
  turmeric: ["turmeric"],
  jahe: ["ginger"],
  ginger: ["ginger"],
  kecap: ["kecap_manis"],
  kecap_manis: ["kecap_manis"],
  kentang: ["potato"],
  potato: ["potato"],
  telur: ["egg"],
  egg: ["egg"],
  mentega: ["butter"],
  butter: ["butter"],
  merica: ["pepper"],
  pepper: ["pepper"],
  lada: ["pepper"],
};

/** Multi-word phrases extracted before generic split. */
const PHRASE_TAGS: Array<[RegExp, string]> = [
  [/\bdaging\s+sapi\b/gi, "beef"],
  [/\bdaging\s+ayam\b/gi, "chicken"],
  [/\bbawang\s+putih\b/gi, "garlic"],
  [/\bbawang\s+merah\b/gi, "shallot"],
  [/\bbawang\s+bombay\b/gi, "onion"],
  [/\bminyak\s+goreng\b/gi, "cooking_oil"],
  [/\bkecap\s+manis\b/gi, "kecap_manis"],
];

/** Expand a pantry tag to itself + known equivalents for matching. */
export function expandPantryTags(tags: string[]): Set<string> {
  const have = new Set<string>();
  for (const raw of tags) {
    const t = normalizeTag(raw);
    if (!t) continue;
    have.add(t);
    const mapped = ALIAS_TO_CANONICAL[t];
    if (mapped) {
      for (const m of mapped) have.add(m);
    }
  }
  // Reverse: if we have beef, also accept sapi / daging_sapi as matched later
  for (const [alias, canons] of Object.entries(ALIAS_TO_CANONICAL)) {
    if (canons.some((c) => have.has(c))) {
      have.add(alias);
      for (const c of canons) have.add(c);
    }
  }
  return have;
}

export function normalizePantryTags(pantry: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of pantry) {
    const tag = normalizeTag(raw);
    if (!tag) continue;
    const mapped = ALIAS_TO_CANONICAL[tag];
    const toAdd = mapped?.length ? mapped : [tag];
    for (const c of toAdd) {
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

export function toolDiffPantry(
  ingredients: Ingredient[],
  pantry: string[],
): Ingredient[] {
  const have = expandPantryTags(pantry);
  return ingredients.filter((ing) => {
    const tag = normalizeTag(ing.tag);
    if (have.has(tag)) return false;
    const aliases = ALIAS_TO_CANONICAL[tag];
    if (aliases?.some((a) => have.has(a))) return false;
    // Ingredient uses alias form; pantry has canonical
    for (const [alias, canons] of Object.entries(ALIAS_TO_CANONICAL)) {
      if (alias === tag && canons.some((c) => have.has(c))) return false;
      if (canons.includes(tag) && (have.has(alias) || canons.some((c) => have.has(c)))) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Parse free-text bahan lists like "aku punya ayam, bawang" / "daging sapi sama bawang".
 */
export function parseBahanList(text: string): string[] {
  let t = text.trim();
  t = t.replace(
    /^(aku|saya)\s+(punya|ada|cuman?\s+punya|hanya\s+punya)\s+/i,
    "",
  );
  t = t.replace(/^(ada\s+bahan|punya|ada|cuma|cuman|hanya)\s+/i, "");
  t = t.replace(/\bi\s+have\s+/i, "");
  t = t.replace(/\bonly\s+have\s+/i, "");
  t = t.replace(/\ba+ja\b/gi, " ");
  t = t.replace(/,?\s*enak(nya)?\s*(di)?masak\s+apa.*$/i, "");
  t = t.replace(/,?\s*what\s+can\s+i\s+cook.*$/i, "");

  const fromPhrases: string[] = [];
  for (const [re, tag] of PHRASE_TAGS) {
    re.lastIndex = 0;
    if (re.test(t)) {
      fromPhrases.push(tag);
      re.lastIndex = 0;
      t = t.replace(re, " ");
    }
  }

  const chunks = t
    .split(/,| dan | sama | dengan | & |\n|;|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s
        .replace(/^(ada|punya|saya\s+punya|aku\s+punya|cuma|cuman|hanya|bahan)\s+/i, "")
        .replace(/\s+(siap|sudah|aja)$/i, "")
        .trim(),
    )
    .filter(Boolean);

  return normalizePantryTags([...fromPhrases, ...chunks]);
}
