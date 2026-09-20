/** Canonical units for botlevy — keep in sync with packages/commerce-shared/src/units.ts */

export const MERCHANT_UNITS = ["kg", "g", "ml", "L", "sdm", "sdt"] as const;

export const RECIPE_UNITS = [
  "kg",
  "g",
  "ml",
  "L",
  "sdm",
  "sdt",
  "biji",
  "butir",
  "siung",
  "ikat",
  "lembar",
  "porsi",
  "pcs",
] as const;

const ALIAS_MAP: Record<string, string> = {
  gr: "g",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  liter: "L",
  litre: "L",
  liters: "L",
  litres: "L",
  l: "L",
  milliliter: "ml",
  millilitre: "ml",
  milliliters: "ml",
  millilitres: "ml",
  tbsp: "sdm",
  tablespoon: "sdm",
  tablespoons: "sdm",
  tsp: "sdt",
  teaspoon: "sdt",
  teaspoons: "sdt",
  "sendok makan": "sdm",
  "sendok teh": "sdt",
  pc: "pcs",
  piece: "pcs",
  pieces: "pcs",
  buah: "biji",
  clove: "siung",
  cloves: "siung",
};

export function normalizeUnit(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return "pcs";
  if (ALIAS_MAP[t]) return ALIAS_MAP[t]!;
  if (t === "l") return "L";
  const recipeHit = RECIPE_UNITS.find((u) => u.toLowerCase() === t);
  if (recipeHit) return recipeHit;
  const merchantHit = MERCHANT_UNITS.find((u) => u.toLowerCase() === t);
  if (merchantHit) return merchantHit;
  return t;
}

export function unitsCompatible(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeUnit(a) === normalizeUnit(b);
}

export function isMerchantUnit(raw: string | null | undefined): boolean {
  const n = normalizeUnit(raw);
  return (MERCHANT_UNITS as readonly string[]).some(
    (u) => u === n || u.toLowerCase() === n.toLowerCase(),
  );
}

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
