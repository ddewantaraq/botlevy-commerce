import type { AgentStep, Ingredient, Quote } from "../store.js";

export type Intent = "known_dish" | "pantry_first" | "open_goal";

export type RunStatus =
  | "suggestions"
  | "cookable"
  | "quoted"
  | "no_merchant"
  | "failed";

export type DishSuggestion = {
  dish: string;
  reason: string;
  ingredientsPreview?: string[];
};

export type OrchestratorInput = {
  goal: string;
  pantry?: string[];
  selectedDish?: string;
};

/** Same shape as AgentStep — ready for future SSE emission. */
export type ProgressEvent = AgentStep;

export type Plan = {
  dish: string;
  steps: string[];
  ingredients: Ingredient[];
};

export type MatchResult = {
  matched: Array<{
    ingredient: Ingredient;
    productId: string;
    name: string;
    unitPrice: number;
    stock: number;
    qty: number;
    /** Merchant product unit. */
    unit: string;
  }>;
  unmatched: Ingredient[];
  oos: Ingredient[];
};

export type Substitution = {
  fromTag: string;
  toTag: string;
  reason: string;
};

export type OrchestratorContext = {
  goal: string;
  selectedDish?: string;
  pantry: string[];
  intent?: Intent;
  status?: RunStatus;
  plan?: Plan;
  missing?: Ingredient[];
  suggestions?: DishSuggestion[];
  quote?: Quote;
  steps: AgentStep[];
};

export function appendStep(
  ctx: OrchestratorContext,
  tool: string,
  args?: unknown,
  result?: unknown,
  error?: string,
  llm?: AgentStep["llm"],
): AgentStep {
  const step: AgentStep = {
    tool,
    args,
    result,
    error,
    at: new Date().toISOString(),
    ...(llm ? { llm } : {}),
  };
  ctx.steps.push(step);
  return step;
}

/** Summary for API responses when steps carry llm payloads (LLM_TRACE). */
export function summarizeRunObs(steps: AgentStep[]): {
  llmCalls: number;
  parseFails: number;
} | undefined {
  const withLlm = steps.filter((s) => s.llm);
  if (withLlm.length === 0) return undefined;
  return {
    llmCalls: withLlm.length,
    parseFails: withLlm.filter((s) => s.llm?.parseOk === false).length,
  };
}
