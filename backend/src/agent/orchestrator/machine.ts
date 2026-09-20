import type { Intent } from "../types.js";

export type Stage =
  | "classify"
  | "pantry_normalize"
  | "menu_suggest"
  | "plan_recipe"
  | "diff_pantry"
  | "match_and_quote"
  | "done";

/**
 * Deterministic stage list for an intent.
 * selectedDish short-circuits pantry_first into the commerce path.
 */
export function stagesFor(opts: {
  intent: Intent;
  selectedDish?: string;
}): Stage[] {
  const hasDish = Boolean(opts.selectedDish?.trim());

  if (opts.intent === "pantry_first" && !hasDish) {
    return ["classify", "pantry_normalize", "menu_suggest", "done"];
  }

  if (opts.intent === "pantry_first" && hasDish) {
    return [
      "classify",
      "pantry_normalize",
      "plan_recipe",
      "diff_pantry",
      "match_and_quote",
      "done",
    ];
  }

  // known_dish | open_goal
  return ["classify", "plan_recipe", "diff_pantry", "match_and_quote", "done"];
}
