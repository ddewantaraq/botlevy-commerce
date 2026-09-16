import {
  selectMerchant,
  toolApplySubstitutions,
  toolMatchCatalog,
} from "../tools/catalog.js";
import { toolCreateQuote } from "../tools/quote.js";
import type { MatchResult, OrchestratorContext, Substitution } from "../types.js";
import { appendStep } from "../types.js";
import type { Quote } from "../../store.js";

export type MerchantAgentResult =
  | { ok: true; quote: Quote }
  | { ok: false; reason: "no_merchant" | "quote_failed"; message: string };

export function runMerchantAgent(ctx: OrchestratorContext): MerchantAgentResult {
  const missing = ctx.missing ?? [];
  if (missing.length === 0) {
    return { ok: false, reason: "quote_failed", message: "Nothing missing to buy" };
  }

  const merchant = selectMerchant(missing);
  if (!merchant) {
    const message = "no signed-in merchant has these items in stock";
    appendStep(
      ctx,
      "match_catalog",
      { missingCount: missing.length },
      undefined,
      message,
    );
    return { ok: false, reason: "no_merchant", message };
  }

  let match: MatchResult = toolMatchCatalog(missing, merchant.id);
  appendStep(
    ctx,
    "match_catalog",
    { merchantId: merchant.id, missingCount: missing.length },
    {
      merchantId: merchant.id,
      merchantName: merchant.name,
      payTo: merchant.payTo,
      matched: match.matched.length,
      oos: match.oos.map((i) => i.tag),
      unmatched: match.unmatched.map((i) => i.tag),
    },
  );

  const haveTags = new Set(match.matched.map((m) => m.ingredient.tag));
  const { substitutions, rematch } = toolApplySubstitutions(match.oos, haveTags);
  appendStep(ctx, "apply_substitutions", { oos: match.oos.map((i) => i.tag) }, {
    substitutions,
  });

  let allSubs: Substitution[] = substitutions;
  if (substitutions.length > 0) {
    const subMatch = toolMatchCatalog(rematch, merchant.id);
    match = {
      matched: [...match.matched, ...subMatch.matched],
      unmatched: [...match.unmatched, ...subMatch.unmatched, ...subMatch.oos],
      oos: [],
    };
    appendStep(ctx, "match_catalog", { phase: "after_substitution" }, {
      matched: match.matched.length,
      unmatched: match.unmatched.map((i) => i.tag),
    });
  }

  try {
    const quote = toolCreateQuote({
      match,
      substitutions: allSubs,
      merchantId: merchant.id,
    });
    appendStep(ctx, "create_quote", { lineCount: quote.lines.length }, {
      quoteId: quote.id,
      merchantName: quote.merchantName,
      total: quote.total,
      payTo: quote.payTo,
      tokenAddress: quote.tokenAddress,
      chainId: quote.chainId,
    });
    ctx.quote = quote;
    return { ok: true, quote };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    appendStep(ctx, "create_quote", undefined, undefined, message);
    if (message.includes("no signed-in merchant")) {
      return { ok: false, reason: "no_merchant", message };
    }
    return { ok: false, reason: "quote_failed", message };
  }
}
