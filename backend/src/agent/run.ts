import type { AgentRun, AgentStep, Ingredient } from "../store.js";
import { newId, saveRun } from "../store.js";
import {
  selectMerchant,
  toolApplySubstitutions,
  toolCreateQuote,
  toolDiffPantry,
  toolMatchCatalog,
  toolPlanRecipe,
  type MatchResult,
} from "./tools.js";

function step(tool: string, args?: unknown, result?: unknown, error?: string): AgentStep {
  return {
    tool,
    args,
    result,
    error,
    at: new Date().toISOString(),
  };
}

/**
 * CommerceAgent: goal → tool pipeline (agentic commerce, not a chatbot).
 * Uses Ollama Cloud for plan_recipe when configured; always runs commerce tools in code.
 */
export async function runCommerceAgent(input: {
  goal: string;
  pantry?: string[];
}): Promise<AgentRun> {
  const pantry = input.pantry ?? [];
  const run: AgentRun = {
    id: newId("run"),
    goal: input.goal,
    pantry,
    steps: [],
    createdAt: new Date().toISOString(),
  };

  // 1) plan_recipe
  const planned = await toolPlanRecipe(input.goal);
  run.steps.push(
    step("plan_recipe", { goal: input.goal }, {
      source: planned.source,
      dish: planned.plan.dish,
      ingredientCount: planned.plan.ingredients.length,
    }),
  );
  run.plan = planned.plan;

  // 2) diff_pantry
  const missing = toolDiffPantry(planned.plan.ingredients, pantry);
  run.steps.push(
    step("diff_pantry", { pantry }, { missingCount: missing.length, missing }),
  );
  run.missing = missing;

  if (missing.length === 0) {
    const message = "Nothing to buy — pantry already covers this recipe";
    run.steps.push(step("match_catalog", { pantry }, undefined, message));
    saveRun(run);
    throw new Error(message);
  }

  const merchant = selectMerchant(missing);
  if (!merchant) {
    const message = "no signed-in merchant has these items in stock";
    run.steps.push(
      step("match_catalog", { missingCount: missing.length }, undefined, message),
    );
    saveRun(run);
    throw new Error(message);
  }

  // 3) match_catalog
  let match: MatchResult = toolMatchCatalog(missing, merchant.id);
  run.steps.push(
    step("match_catalog", { merchantId: merchant.id, missingCount: missing.length }, {
      merchantId: merchant.id,
      merchantName: merchant.name,
      payTo: merchant.payTo,
      matched: match.matched.length,
      oos: match.oos.map((i) => i.tag),
      unmatched: match.unmatched.map((i) => i.tag),
    }),
  );

  // 4) apply_substitutions + re-match
  const haveTags = new Set(match.matched.map((m) => m.ingredient.tag));
  const { substitutions, rematch } = toolApplySubstitutions(match.oos, haveTags);
  run.steps.push(
    step("apply_substitutions", { oos: match.oos.map((i) => i.tag) }, {
      substitutions,
    }),
  );

  if (substitutions.length > 0) {
    const subMatch = toolMatchCatalog(rematch, merchant.id);
    match = {
      matched: [...match.matched, ...subMatch.matched],
      unmatched: [
        ...match.unmatched,
        ...subMatch.unmatched,
        ...subMatch.oos,
      ],
      oos: [],
    };
    run.steps.push(
      step("match_catalog", { phase: "after_substitution" }, {
        matched: match.matched.length,
        unmatched: match.unmatched.map((i) => i.tag),
      }),
    );
  }

  // 5) create_quote
  try {
    const quote = toolCreateQuote({ match, substitutions, merchantId: merchant.id });
    run.quote = quote;
    run.steps.push(
      step("create_quote", { lineCount: quote.lines.length }, {
        quoteId: quote.id,
        merchantName: quote.merchantName,
        total: quote.total,
        payTo: quote.payTo,
        tokenAddress: quote.tokenAddress,
        chainId: quote.chainId,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    run.steps.push(step("create_quote", undefined, undefined, message));
    saveRun(run);
    throw err instanceof Error ? err : new Error(message);
  }

  return saveRun(run);
}

export type { Ingredient };
