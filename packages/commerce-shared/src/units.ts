import unitsConfig from "./units.json";

export type UnitsConfig = {
  merchantUnits: string[];
  recipeUnits: string[];
  aliases: Record<string, string>;
};

export const UNITS: UnitsConfig = unitsConfig;

export const MERCHANT_UNITS: readonly string[] = UNITS.merchantUnits;
export const RECIPE_UNITS: readonly string[] = UNITS.recipeUnits;

const ALIAS_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(UNITS.aliases).map(([k, v]) => [k.toLowerCase().trim(), v]),
);

/** Canonical unit id (aliases → merchant/recipe ids). Unknown → trimmed lowercase. */
export function normalizeUnit(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return "pcs";
  if (ALIAS_MAP[t]) return ALIAS_MAP[t]!;
  // "500gr" style glued — rare; callers usually split qty/unit
  if (ALIAS_MAP[t.replace(/\s+/g, " ")]) {
    return ALIAS_MAP[t.replace(/\s+/g, " ")]!;
  }
  // Preserve canonical casing for L
  if (t === "l") return "L";
  const recipeHit = RECIPE_UNITS.find((u) => u.toLowerCase() === t);
  if (recipeHit) return recipeHit;
  const merchantHit = MERCHANT_UNITS.find((u) => u.toLowerCase() === t);
  if (merchantHit) return merchantHit;
  return t;
}

/** Same canonical unit after alias normalize. */
export function unitsCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
}

export function isMerchantUnit(raw: string | null | undefined): boolean {
  const n = normalizeUnit(raw);
  return MERCHANT_UNITS.some((u) => u === n || u.toLowerCase() === n.toLowerCase());
}

/** Display "500 g" / "1 sdt". */
export function formatQtyUnit(
  qty: number | null | undefined,
  unit: string | null | undefined,
): string {
  const q =
    typeof qty === "number" && Number.isFinite(qty) && qty > 0 ? qty : 1;
  const u = normalizeUnit(unit);
  const qStr = Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100);
  return `${qStr} ${u}`;
}

/** "Ayam 500 g" or "Ayam" if no qty. */
export function formatIngredientLabel(opts: {
  name?: string | null;
  tag?: string | null;
  qty?: number | null;
  unit?: string | null;
}): string {
  const name =
    (opts.name && opts.name.trim()) ||
    (opts.tag ? opts.tag.replace(/_/g, " ").trim() : "") ||
    "Bahan";
  if (
    opts.qty == null ||
    !Number.isFinite(opts.qty) ||
    (opts.qty as number) <= 0
  ) {
    return name;
  }
  return `${name} ${formatQtyUnit(opts.qty, opts.unit)}`;
}
