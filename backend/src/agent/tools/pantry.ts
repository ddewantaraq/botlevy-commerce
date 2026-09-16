import type { Ingredient } from "../../store.js";

/** Normalize a free-text or chip token to snake_case tag. */
export function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizePantryTags(pantry: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of pantry) {
    const tag = normalizeTag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function toolDiffPantry(
  ingredients: Ingredient[],
  pantry: string[],
): Ingredient[] {
  const have = new Set(pantry.map((t) => t.toLowerCase().trim()));
  return ingredients.filter((ing) => !have.has(ing.tag.toLowerCase()));
}
