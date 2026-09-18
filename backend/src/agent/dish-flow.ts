import type { AgentRun, Ingredient, PlanningDraft, RecipePlan } from "../store.js";
import {
  clearPlanningDraft,
  getPlanningDraft,
  newId,
  saveRun,
  setPlanningDraft,
} from "../store.js";
import {
  classifyIntentRules,
  looksLikeBareDish,
} from "./subagents/classify-intent.js";
import { runMerchantAgent } from "./subagents/merchant-agent.js";
import { runRecipeAgent } from "./subagents/recipe-agent.js";
import { normalizePantryTags, toolDiffPantry } from "./tools/pantry.js";
import type { OrchestratorContext } from "./types.js";
import { appendStep } from "./types.js";

export type DishFlowResult =
  | { type: "passthrough" }
  | { type: "ask_bahan"; dish: string; message: string }
  | {
      type: "confirm_gap";
      dish: string;
      message: string;
      plan: RecipePlan;
      missing: Ingredient[];
      userBahan: string[];
    }
  | { type: "run"; run: AgentRun };

function titleCaseDish(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Strip cook verbs; return dish label. */
export function extractDishName(goal: string): string {
  let g = goal.trim();
  g = g.replace(
    /^(saya\s+)?(mau\s+|inginin\s+|ingin\s+)?(masak|cook|buat|make)\s+/i,
    "",
  );
  g = g.replace(/^(recipe\s+for)\s+/i, "");
  g = g.replace(/\s*,\s*bahan\b.*$/i, "");
  g = g.replace(/\s+bahan\s*[:=].*$/i, "");
  g = g.replace(/[.…,!?]+$/g, "").trim();
  return titleCaseDish(g || goal.trim());
}

/** Bahan listed in the same message as the dish. */
export function extractInlineBahan(goal: string): string[] | null {
  const m = goal.match(/\bbahan\s*[:=]\s*(.+)$/i);
  if (m?.[1]) return parseBahanList(m[1]);
  const parts = goal.split(/\s*,\s*/);
  if (parts.length >= 3 && looksLikeBareDish(parts[0] ?? "")) {
    return parseBahanList(parts.slice(1).join(", "));
  }
  return null;
}

export function parseBahanList(text: string): string[] {
  const chunks = text
    .split(/,| dan | & |\n|;/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) =>
      s
        .replace(/^(ada|punya|saya\s+punya|cuma|cuman|hanya)\s+/i, "")
        .replace(/\s+(siap|sudah)$/i, "")
        .trim(),
    );
  return normalizePantryTags(chunks);
}

function isYes(t: string): boolean {
  const n = t.trim().toLowerCase();
  return /^(ya|yes|y|iya|betul|benar|ok|oke|setuju|benar\s+semua)$/.test(n);
}

function isNo(t: string): boolean {
  const n = t.trim().toLowerCase();
  return (
    /^(tidak|no|nggak|gak|salah|bukan|ganti)$/.test(n) ||
    /\b(tidak|salah|ganti\s+bahan|input\s+lagi)\b/.test(n)
  );
}

function formatGapMessage(
  dish: string,
  userBahan: string[],
  missing: Ingredient[],
): string {
  const have =
    userBahan.length > 0 ? userBahan.join(", ") : "(belum ada yang dicatat)";
  if (missing.length === 0) {
    return `Resep **${dish}** — dari bahan yang kamu sebut (**${have}**), sepertinya sudah cukup.\n\nApakah ini sudah benar? (ya / tidak)`;
  }
  const gap = missing.map((m) => `• ${m.name} (${m.tag})`).join("\n");
  return `Resep **${dish}**. Bahan yang kamu sebut: **${have}**.\n\nYang masih kurang (perlu dibeli):\n${gap}\n\nApakah daftar ini sudah benar? (ya / tidak)`;
}

function askBahanMessage(dish: string): string {
  return `Oke, **${dish}**. Bahan apa yang sudah kamu punya? Sebutkan ya (mis. ayam, bawang, kunyit).`;
}

function reaskBahanMessage(dish: string): string {
  return `Oke, sebutkan lagi bahan untuk **${dish}** yang sudah kamu punya.`;
}

async function planAndGap(
  dish: string,
  userBahan: string[],
): Promise<{ plan: RecipePlan; missing: Ingredient[]; steps: AgentRun["steps"] }> {
  const ctx: OrchestratorContext = {
    goal: `Plan a full home-cooking recipe for: ${dish}`,
    selectedDish: dish,
    pantry: userBahan,
    intent: "known_dish",
    steps: [],
  };
  await runRecipeAgent(ctx);
  if (!ctx.plan) throw new Error("No plan");
  const missing = toolDiffPantry(ctx.plan.ingredients, userBahan);
  appendStep(ctx, "diff_pantry", { pantry: userBahan }, {
    missingCount: missing.length,
    missing,
  });
  return { plan: ctx.plan, missing, steps: ctx.steps };
}

function finalizeQuoteOrCookable(
  draft: PlanningDraft,
  goal: string,
): AgentRun {
  const id = newId("run");
  const createdAt = new Date().toISOString();
  const ctx: OrchestratorContext = {
    goal,
    selectedDish: draft.dish,
    pantry: draft.userBahan,
    intent: "known_dish",
    plan: draft.plan,
    missing: draft.missing ?? [],
    steps: [],
  };
  appendStep(ctx, "confirm_gap", { confirmed: true }, {
    dish: draft.dish,
    missingCount: ctx.missing?.length ?? 0,
  });

  if (!ctx.missing || ctx.missing.length === 0) {
    ctx.status = "cookable";
    clearPlanningDraft(draft.cookerAddress);
    return saveRun({
      id,
      goal,
      pantry: draft.userBahan,
      steps: ctx.steps,
      intent: "known_dish",
      status: "cookable",
      selectedDish: draft.dish,
      plan: draft.plan,
      missing: [],
      createdAt,
    });
  }

  const result = runMerchantAgent(ctx);
  clearPlanningDraft(draft.cookerAddress);
  if (result.ok) {
    return saveRun({
      id,
      goal,
      pantry: draft.userBahan,
      steps: ctx.steps,
      intent: "known_dish",
      status: "quoted",
      selectedDish: draft.dish,
      plan: draft.plan,
      missing: draft.missing,
      quote: result.quote,
      createdAt,
    });
  }
  return saveRun({
    id,
    goal,
    pantry: draft.userBahan,
    steps: ctx.steps,
    intent: "known_dish",
    status: result.reason === "no_merchant" ? "no_merchant" : "failed",
    selectedDish: draft.dish,
    plan: draft.plan,
    missing: draft.missing,
    createdAt,
  });
}

/**
 * Multi-turn dish → bahan → confirm gap → quote.
 * Returns passthrough for pantry_first / selectedDish / non-dish goals.
 */
export async function handleDishPlanningTurn(opts: {
  cookerAddress: string;
  goal: string;
  selectedDish?: string;
}): Promise<DishFlowResult> {
  const address = opts.cookerAddress.toLowerCase();
  const goal = opts.goal.trim();

  // Suggestion pick → existing orchestrator commerce path
  if (opts.selectedDish?.trim()) {
    clearPlanningDraft(address);
    return { type: "passthrough" };
  }

  const ruleIntent = classifyIntentRules(goal);

  // Pantry-first always wins; clear any stale draft
  if (ruleIntent === "pantry_first") {
    clearPlanningDraft(address);
    return { type: "passthrough" };
  }

  const draft = getPlanningDraft(address);

  // --- Continue confirm_gap ---
  if (draft?.phase === "confirm_gap") {
    if (isYes(goal)) {
      if (!draft.plan) {
        setPlanningDraft({
          ...draft,
          phase: "await_bahan",
          plan: undefined,
          missing: undefined,
          userBahan: [],
        });
        return {
          type: "ask_bahan",
          dish: draft.dish,
          message: reaskBahanMessage(draft.dish),
        };
      }
      const run = finalizeQuoteOrCookable(draft, goal);
      return { type: "run", run };
    }
    if (isNo(goal)) {
      setPlanningDraft({
        ...draft,
        phase: "await_bahan",
        plan: undefined,
        missing: undefined,
        userBahan: [],
      });
      return {
        type: "ask_bahan",
        dish: draft.dish,
        message: reaskBahanMessage(draft.dish),
      };
    }
    // Unclear — stay in confirm
    return {
      type: "confirm_gap",
      dish: draft.dish,
      message: `Apakah daftar bahan / kekurangan untuk **${draft.dish}** sudah benar? Ketik **ya** atau **tidak**.`,
      plan: draft.plan!,
      missing: draft.missing ?? [],
      userBahan: draft.userBahan,
    };
  }

  // --- Continue await_bahan ---
  if (draft?.phase === "await_bahan") {
    const bahan = parseBahanList(goal);
    if (bahan.length === 0) {
      return {
        type: "ask_bahan",
        dish: draft.dish,
        message: askBahanMessage(draft.dish),
      };
    }
    try {
      const { plan, missing } = await planAndGap(draft.dish, bahan);
      setPlanningDraft({
        ...draft,
        phase: "confirm_gap",
        userBahan: bahan,
        plan,
        missing,
      });
      return {
        type: "confirm_gap",
        dish: draft.dish,
        message: formatGapMessage(draft.dish, bahan, missing),
        plan,
        missing,
        userBahan: bahan,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const id = newId("run");
      const run = saveRun({
        id,
        goal,
        pantry: bahan,
        steps: [
          {
            tool: "plan_recipe",
            error: message,
            at: new Date().toISOString(),
          },
        ],
        intent: "known_dish",
        status: "failed",
        selectedDish: draft.dish,
        createdAt: new Date().toISOString(),
      });
      return { type: "run", run };
    }
  }

  // --- Start known_dish ask_bahan ---
  if (ruleIntent === "known_dish" || looksLikeBareDish(goal)) {
    const dish = extractDishName(goal);
    const inline = extractInlineBahan(goal);
    if (inline && inline.length > 0) {
      try {
        const { plan, missing } = await planAndGap(dish, inline);
        setPlanningDraft({
          cookerAddress: address,
          dish,
          phase: "confirm_gap",
          userBahan: inline,
          plan,
          missing,
          updatedAt: new Date().toISOString(),
        });
        return {
          type: "confirm_gap",
          dish,
          message: formatGapMessage(dish, inline, missing),
          plan,
          missing,
          userBahan: inline,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const run = saveRun({
          id: newId("run"),
          goal,
          pantry: inline,
          steps: [
            {
              tool: "plan_recipe",
              error: message,
              at: new Date().toISOString(),
            },
          ],
          intent: "known_dish",
          status: "failed",
          selectedDish: dish,
          createdAt: new Date().toISOString(),
        });
        return { type: "run", run };
      }
    }

    setPlanningDraft({
      cookerAddress: address,
      dish,
      phase: "await_bahan",
      userBahan: [],
      updatedAt: new Date().toISOString(),
    });
    return {
      type: "ask_bahan",
      dish,
      message: askBahanMessage(dish),
    };
  }

  return { type: "passthrough" };
}
