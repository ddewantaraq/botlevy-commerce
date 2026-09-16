import { SUBSTITUTION_MAP } from "../../seed.js";
import type { Ingredient, Merchant } from "../../store.js";
import {
  getMerchant,
  isRealPayTo,
  listMerchants,
  listProducts,
} from "../../store.js";
import type { MatchResult, Substitution } from "../types.js";

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
    const requested =
      Number.isFinite(ing.qty) && ing.qty > 0 ? Math.ceil(ing.qty) : 1;
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
  substitutions: Substitution[];
  rematch: Ingredient[];
} {
  const substitutions: Substitution[] = [];
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
