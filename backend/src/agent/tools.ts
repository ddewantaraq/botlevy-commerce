import { z } from "zod";
import { Ollama } from "ollama";
import { env } from "../config.js";
import {
  AYAM_SEMUR_FALLBACK,
  SUBSTITUTION_MAP,
} from "../seed.js";
import type { Ingredient, OrderLine, Quote } from "../store.js";
import type { Merchant } from "../store.js";
import {
  getMerchant,
  isRealPayTo,
  listMerchants,
  listProducts,
  newId,
  saveQuote,
} from "../store.js";

const recipeSchema = z.object({
  dish: z.string(),
  steps: z.array(z.string()).min(1),
  ingredients: z
    .array(
      z.object({
        tag: z.string(),
        name: z.string(),
        qty: z.number(),
        unit: z.string(),
      }),
    )
    .min(1),
});

export type PlanResult = z.infer<typeof recipeSchema>;

export type MatchResult = {
  matched: Array<{
    ingredient: Ingredient;
    productId: string;
    name: string;
    unitPrice: number;
    stock: number;
    qty: number;
  }>;
  unmatched: Ingredient[];
  oos: Ingredient[];
};

function ollamaClient() {
  const headers: Record<string, string> = {};
  if (env.OLLAMA_API_KEY) {
    headers.Authorization = `Bearer ${env.OLLAMA_API_KEY}`;
  }
  return new Ollama({ host: env.OLLAMA_HOST, headers });
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function toolPlanRecipe(goal: string): Promise<{
  plan: PlanResult;
  source: "ollama" | "fallback";
}> {
  if (!env.OLLAMA_API_KEY) {
    console.warn("[agent] plan_recipe: OLLAMA_API_KEY empty → fallback");
    return { plan: AYAM_SEMUR_FALLBACK, source: "fallback" };
  }

  try {
    console.log("[agent] plan_recipe: calling ollama", {
      host: env.OLLAMA_HOST,
      model: env.OLLAMA_MODEL,
      keyLen: env.OLLAMA_API_KEY.length,
      keyPrefix: `${env.OLLAMA_API_KEY.slice(0, 4)}…`,
    });
    const client = ollamaClient();
    const response = await client.chat({
      model: env.OLLAMA_MODEL,
      stream: false,
      messages: [
        {
          role: "system",
          content: `You are a cooking commerce agent tool. Return ONLY JSON:
{"dish":string,"steps":string[],"ingredients":[{"tag":string,"name":string,"qty":number,"unit":string}]}
Use snake_case tags like chicken, shallot, kecap_manis, nutmeg, potato, cooking_oil, salt.
Prefer Indonesian home-cooking when the goal mentions Indonesian food.`,
        },
        { role: "user", content: goal },
      ],
      options: { temperature: 0 },
    });
    const content = response.message?.content ?? "";
    const parsed = recipeSchema.parse(extractJson(content));
    console.log("[agent] plan_recipe: ollama ok", {
      dish: parsed.dish,
      ingredientTags: parsed.ingredients.map((i) => i.tag),
    });
    return { plan: parsed, source: "ollama" };
  } catch (err) {
    console.warn("[agent] plan_recipe fallback:", err);
    return { plan: AYAM_SEMUR_FALLBACK, source: "fallback" };
  }
}

export function toolDiffPantry(
  ingredients: Ingredient[],
  pantry: string[],
): Ingredient[] {
  const have = new Set(pantry.map((t) => t.toLowerCase().trim()));
  return ingredients.filter((ing) => !have.has(ing.tag.toLowerCase()));
}

function coversTag(merchant: Merchant, tag: string) {
  const products = listProducts(merchant.id);
  const want = tag.toLowerCase();
  return products.some(
    (p) => p.stock > 0 && p.tags.some((t) => t.toLowerCase() === want),
  );
}

function coversIngredient(merchant: Merchant, tag: string) {
  if (coversTag(merchant, tag)) return true;
  const sub = SUBSTITUTION_MAP[tag.toLowerCase()];
  return !!sub && coversTag(merchant, sub);
}

function merchantUpdatedAt(merchant: Merchant) {
  return merchant.updatedAt ?? "";
}

/** Real payTo + at least one product. Seed placeholder shops are not eligible. */
export function eligibleMerchants() {
  return listMerchants().filter(
    (m) => isRealPayTo(m.payTo) && listProducts(m.id).length > 0,
  );
}

/**
 * Pick the shop with the most in-stock tag coverage.
 * Tie → newest/last-updated shop.
 */
export function selectMerchant(missing: Ingredient[]): Merchant | null {
  const candidates = eligibleMerchants();
  let best: { merchant: Merchant; score: number } | null = null;

  for (const merchant of candidates) {
    const score = missing.reduce(
      (n, ing) => n + (coversIngredient(merchant, ing.tag) ? 1 : 0),
      0,
    );
    if (score === 0) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        merchantUpdatedAt(merchant) > merchantUpdatedAt(best.merchant))
    ) {
      best = { merchant, score };
    }
  }

  return best?.merchant ?? null;
}

export function toolMatchCatalog(
  missing: Ingredient[],
  merchantId: string,
): MatchResult {
  const merchant = getMerchant(merchantId);
  if (!merchant || !isRealPayTo(merchant.payTo)) {
    return { matched: [], unmatched: missing, oos: [] };
  }
  const products = listProducts(merchant.id);
  const matched: MatchResult["matched"] = [];
  const unmatched: Ingredient[] = [];
  const oos: Ingredient[] = [];

  for (const ing of missing) {
    const candidates = products.filter((p) =>
      p.tags.map((t) => t.toLowerCase()).includes(ing.tag.toLowerCase()),
    );
    if (candidates.length === 0) {
      unmatched.push(ing);
      continue;
    }
    const inStock = candidates
      .filter((p) => p.stock > 0)
      .sort((a, b) => b.stock - a.stock)[0];
    if (!inStock) {
      oos.push(ing);
      continue;
    }
    const requested = Number.isFinite(ing.qty) && ing.qty > 0 ? Math.ceil(ing.qty) : 1;
    const qty = Math.min(requested, inStock.stock);
    if (qty < 1) {
      oos.push(ing);
      continue;
    }
    matched.push({
      ingredient: ing,
      productId: inStock.id,
      name: inStock.name,
      unitPrice: inStock.price,
      stock: inStock.stock,
      qty,
    });
  }

  return { matched, unmatched, oos };
}

export function toolApplySubstitutions(
  oos: Ingredient[],
  alreadyMatchedTags: Set<string>,
): {
  substitutions: Array<{ fromTag: string; toTag: string; reason: string }>;
  rematch: Ingredient[];
} {
  const substitutions: Array<{ fromTag: string; toTag: string; reason: string }> =
    [];
  const rematch: Ingredient[] = [];

  for (const ing of oos) {
    const toTag = SUBSTITUTION_MAP[ing.tag.toLowerCase()];
    if (!toTag || alreadyMatchedTags.has(toTag)) {
      rematch.push(ing);
      continue;
    }
    substitutions.push({
      fromTag: ing.tag,
      toTag,
      reason: `${ing.tag} out of stock; trying ${toTag}`,
    });
    rematch.push({ ...ing, tag: toTag, name: `${ing.name} (sub: ${toTag})` });
  }

  return { substitutions, rematch };
}

export function toolCreateQuote(opts: {
  match: MatchResult;
  substitutions: Array<{ fromTag: string; toTag: string; reason: string }>;
  merchantId: string;
}): Quote {
  const merchant = getMerchant(opts.merchantId);
  if (!merchant) throw new Error("No merchant available");
  if (!isRealPayTo(merchant.payTo)) {
    throw new Error("Merchant payTo is not a real wallet address");
  }
  if (opts.match.matched.length === 0) {
    throw new Error("no signed-in merchant has these items in stock");
  }
  if (!env.MOCK_USDC_ADDRESS) {
    console.warn("[quote] MOCK_USDC_ADDRESS empty — quote still created for UI");
  }

  const lines: OrderLine[] = opts.match.matched.map((m) => ({
    productId: m.productId,
    name: m.name,
    qty: m.qty,
    unitPrice: m.unitPrice,
    tag: m.ingredient.tag,
  }));

  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const quote: Quote = {
    id: newId("quote"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    payTo: merchant.payTo.toLowerCase(),
    tokenAddress: env.MOCK_USDC_ADDRESS || ethersZero(),
    chainId: env.CHAIN_ID,
    total,
    lines,
    substitutions: opts.substitutions,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
  return saveQuote(quote);
}

function ethersZero() {
  return "0x0000000000000000000000000000000000000000";
}
