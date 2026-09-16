import { env } from "../../config.js";
import type { OrderLine, Quote } from "../../store.js";
import { getMerchant, isRealPayTo, newId, saveQuote } from "../../store.js";
import type { MatchResult, Substitution } from "../types.js";

function ethersZero() {
  return "0x0000000000000000000000000000000000000000";
}

export function toolCreateQuote(opts: {
  match: MatchResult;
  substitutions: Substitution[];
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
