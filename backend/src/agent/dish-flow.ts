import type { AgentRun, Ingredient, PlanningDraft, RecipePlan } from "../store.js";
import {
  clearLastReadyRun,
  clearPendingStartPrep,
  clearPlanningDraft,
  getLastPlanningPantry,
  getLastReadyRunId,
  getPlanningDraft,
  getRun,
  markReadyForPrep,
  newId,
  saveRun,
  setLastReadyRun,
  setPlanningDraft,
} from "../store.js";
import {
  classifyConfirmIntent,
  isAffirmative,
  isNegative,
  normalizeConfirmText,
} from "../cooker/confirm-intent.js";
import {
  classifyIntentRules,
  looksLikeBareDish,
  PANTRY_FIRST_RE,
} from "./subagents/classify-intent.js";
import { runMerchantAgent } from "./subagents/merchant-agent.js";
import { runRecipeAgent } from "./subagents/recipe-agent.js";
import { normalizePantryTags, parseBahanList, toolDiffPantry } from "./tools/pantry.js";
import { detectReplyLang, pickCopy, type ReplyLang } from "./reply-lang.js";
import type { OrchestratorContext } from "./types.js";
import { appendStep } from "./types.js";
import { isOffTopicByRules, isOffTopicUtterance } from "./planning-gate.js";

export { parseBahanList } from "./tools/pantry.js";

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
  | {
      type: "ask_quote";
      dish: string;
      message: string;
      plan: RecipePlan;
      missing: Ingredient[];
      userBahan: string[];
    }
  | {
      type: "idle";
      dish: string;
      message: string;
      plan?: RecipePlan;
      missing?: Ingredient[];
      userBahan: string[];
      runId?: string;
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

/** Soft ASR: “quotes” → “quote”. */
export function softNormalizeQuoteWords(t: string): string {
  return t
    .replace(/\bquotes\b/gi, "quote")
    .replace(/\bkuotes\b/gi, "quote")
    .replace(/\bkuote\b/gi, "quote");
}

/** Explicit want-quote phrases (no bare ya/ok). */
export function isWantQuoteExplicit(t: string): boolean {
  const n = softNormalizeQuoteWords(normalizeConfirmText(t));
  return (
    /^(quote|mau quote|butuh quote|minta quote|iya quote|want quote|get quote)$/.test(
      n,
    ) ||
    /^(quote|mau quote|minta quote)\s+(aja|dong|deh|lah|ya|please)$/.test(n) ||
    /\b(mau\s+quote|butuh\s+quote|minta\s+quote|jadi\s+mau\s+quote|want\s+(a\s+)?quote|pesan\s+(dari\s+)?warung|ambil\s+quote|quote\s+dong)\b/.test(
      n,
    )
  );
}

function looksQuoteIsh(t: string): boolean {
  const n = softNormalizeQuoteWords(normalizeConfirmText(t));
  return /\b(quote|warung|merchant)\b/.test(n);
}

/** Ask-quote phase: explicit phrases or bare affirmative (ya = take quote). */
function isWantQuote(t: string): boolean {
  if (isWantQuoteExplicit(t)) return true;
  return isAffirmative(t);
}

export function isSkipQuote(t: string): boolean {
  const n = softNormalizeQuoteWords(normalizeConfirmText(t));
  if (isNegative(n)) return true;
  return (
    /^(skip|belanja sendiri|beli sendiri|gak usah|tidak usah)$/.test(n) ||
    /\b(belanja\s+sendiri|beli\s+sendiri|gak\s+usah\s+quote|tanpa\s+quote|skip\s+quote)\b/.test(
      n,
    )
  );
}

function isStartPrep(t: string): boolean {
  const n = normalizeConfirmText(t);
  return (
    /^(mulai|mulai masak|siapkan|prep|pre-cook|masak sekarang|start)$/.test(n) ||
    /\b(mulai\s+masak|siapkan\s+bahan|start\s+prep|start\s+cooking|pre-?cook)\b/.test(
      n,
    )
  );
}

export { isStartPrep };

function formatGapMessage(
  dish: string,
  userBahan: string[],
  missing: Ingredient[],
  lang: ReplyLang,
): string {
  const have =
    userBahan.length > 0 ? userBahan.join(", ") : pickCopy(lang, "(belum ada)", "(none listed)");
  if (missing.length === 0) {
    return pickCopy(
      lang,
      `Resep **${dish}** — dari bahan yang kamu sebut (**${have}**), sepertinya sudah cukup.\n\nApakah ini sudah benar? Bilang **ya** atau **tidak**.`,
      `Recipe **${dish}** — with what you listed (**${have}**), it looks complete.\n\nIs this correct? Say **yes** or **no**.`,
    );
  }
  const gap = missing.map((m) => `• ${m.name} (${m.tag})`).join("\n");
  return pickCopy(
    lang,
    `Resep **${dish}**. Bahan yang kamu sebut: **${have}**.\n\nYang masih kurang:\n${gap}\n\nApakah daftar ini sudah benar? Bilang **ya** atau **tidak**.`,
    `Recipe **${dish}**. You listed: **${have}**.\n\nStill missing:\n${gap}\n\nIs this list correct? Say **yes** or **no**.`,
  );
}

function askBahanMessage(dish: string, lang: ReplyLang): string {
  return pickCopy(
    lang,
    `Oke, **${dish}**. Bahan apa yang sudah kamu punya? Sebutkan ya (mis. ayam, bawang, kunyit).`,
    `Got it, **${dish}**. What ingredients do you already have? List them (e.g. chicken, onion, turmeric).`,
  );
}

function reaskBahanMessage(dish: string, lang: ReplyLang): string {
  return pickCopy(
    lang,
    `Oke, sebutkan lagi bahan untuk **${dish}** yang sudah kamu punya.`,
    `OK — list the ingredients you have for **${dish}** again.`,
  );
}

function askQuoteMessage(
  dish: string,
  missing: Ingredient[],
  lang: ReplyLang,
): string {
  const gap = missing.map((m) => m.name).join(", ");
  return pickCopy(
    lang,
    `Bahan kurang untuk **${dish}**: ${gap}.\n\nMau **quote** dari warung, atau belanja sendiri? Bilang **ya** = quote / **tidak** = belanja sendiri.`,
    `Missing for **${dish}**: ${gap}.\n\nWant a warung **quote**, or buy on your own? Say **yes** = quote / **no** = buy yourself.`,
  );
}

function idleMessage(dish: string, lang: ReplyLang): string {
  return pickCopy(
    lang,
    `Oke — kamu belanja sendiri. Resep **${dish}** tetap tersimpan.\n\nBilang **mulai masak** kalau siap, **mau quote** kalau berubah pikiran, atau sebut menu baru.`,
    `OK — you'll buy yourself. Recipe **${dish}** is saved here.\n\nSay **start cooking** when ready, **want quote** if you change your mind, or name a new dish.`,
  );
}

function idleNudge(dish: string, lang: ReplyLang): string {
  return pickCopy(
    lang,
    `Masih di resep **${dish}**. Bilang **mau quote**, **mulai masak**, atau sebut menu / bahan baru.`,
    `Still on **${dish}**. Say **want quote**, **start cooking**, or name a new dish / ingredients.`,
  );
}

/** After quote fails (no stock / error) — keep recipe, stay idle. */
function noMerchantIdleMessage(
  dish: string,
  reason: "no_merchant" | "failed",
  lang: ReplyLang,
): string {
  if (reason === "no_merchant") {
    return pickCopy(
      lang,
      `Warung belum punya stok untuk bahan **${dish}**.\n\nResep tetap tersimpan — kamu bisa **belanja sendiri**. Bilang **mulai masak** kalau siap, **mau quote** kalau mau coba lagi, atau sebut menu baru.`,
      `No signed-in warung has stock for **${dish}**.\n\nRecipe is saved — you can **shop yourself**. Say **start cooking** when ready, **want quote** to try again, or name a new dish.`,
    );
  }
  return pickCopy(
    lang,
    `Gagal ambil quote untuk **${dish}**. Resep tetap tersimpan.\n\nBilang **mulai masak**, **mau quote** lagi, atau sebut menu baru.`,
    `Could not get a quote for **${dish}**. Recipe is saved.\n\nSay **start cooking**, **want quote** again, or name a new dish.`,
  );
}

/** Stay on current phase; remind user what to say (off-topic / gibberish). */
function stayOnPhase(
  draft: PlanningDraft,
  lang: ReplyLang,
): DishFlowResult {
  const prefix = pickCopy(
    lang,
    "Itu belum terkait masak. ",
    "That doesn't relate to cooking. ",
  );
  if (draft.phase === "ask_quote") {
    return {
      type: "ask_quote",
      dish: draft.dish,
      message: prefix + askQuoteMessage(draft.dish, draft.missing ?? [], lang),
      plan: draft.plan!,
      missing: draft.missing ?? [],
      userBahan: draft.userBahan,
    };
  }
  if (draft.phase === "confirm_gap") {
    return {
      type: "confirm_gap",
      dish: draft.dish,
      message:
        prefix +
        (draft.plan
          ? formatGapMessage(
              draft.dish,
              draft.userBahan,
              draft.missing ?? [],
              lang,
            )
          : pickCopy(
              lang,
              `Bilang **ya** atau **tidak** untuk **${draft.dish}**.`,
              `Say **yes** or **no** for **${draft.dish}**.`,
            )),
      plan: draft.plan!,
      missing: draft.missing ?? [],
      userBahan: draft.userBahan,
    };
  }
  if (draft.phase === "await_bahan") {
    return {
      type: "ask_bahan",
      dish: draft.dish,
      message: prefix + askBahanMessage(draft.dish, lang),
    };
  }
  // idle / ask_quote already covered; default idle nudge
  return {
    type: "idle",
    dish: draft.dish,
    message: prefix + idleNudge(draft.dish, lang),
    plan: draft.plan,
    missing: draft.missing,
    userBahan: draft.userBahan,
  };
}

/**
 * “cuma punya magerrr” matches pantry_first via cue, but payload is nonsense.
 * Bare “enak apa” has empty payload → real pantry intent.
 */
function pantryFirstPayloadIsOffTopic(goal: string): boolean {
  const rest = goal
    .replace(PANTRY_FIRST_RE, " ")
    .replace(/^(aku|saya)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!rest) return false;
  return isOffTopicByRules(rest);
}

/**
 * After a quoted (or no_merchant) run, user chooses belanja sendiri.
 * Restores idle draft for the same dish (no orchestrator).
 */
export function abandonQuotedForSelfBuy(
  address: string,
  goal: string,
): DishFlowResult | null {
  const runId = getLastReadyRunId(address);
  if (!runId) return null;
  const run = getRun(runId);
  if (
    !run?.plan ||
    (run.status !== "quoted" && run.status !== "no_merchant")
  ) {
    return null;
  }

  const a = address.toLowerCase();
  const lang = detectReplyLang(goal);
  clearPendingStartPrep(a);
  clearLastReadyRun(a);
  setPlanningDraft({
    cookerAddress: a,
    dish: run.plan.dish || run.selectedDish || "Menu",
    phase: "idle",
    userBahan: [...(run.pantry ?? [])],
    plan: run.plan,
    missing: run.missing ?? [],
    updatedAt: new Date().toISOString(),
  });
  return {
    type: "idle",
    dish: run.plan.dish,
    message: idleMessage(run.plan.dish, lang),
    plan: run.plan,
    missing: run.missing ?? [],
    userBahan: [...(run.pantry ?? [])],
  };
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

function saveCookableRun(draft: PlanningDraft, goal: string): AgentRun {
  const id = newId("run");
  const createdAt = new Date().toISOString();
  clearPlanningDraft(draft.cookerAddress);
  const run = saveRun({
    id,
    goal,
    pantry: draft.userBahan,
    steps: [
      {
        tool: "idle_to_cookable",
        result: { dish: draft.dish },
        at: createdAt,
      },
    ],
    intent: "known_dish",
    status: "cookable",
    selectedDish: draft.dish,
    plan: draft.plan,
    missing: [],
    createdAt,
  });
  markReadyForPrep(draft.cookerAddress, run.id);
  return run;
}

function finalizeQuote(
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
  appendStep(ctx, "ask_quote", { confirmed: true }, {
    dish: draft.dish,
    missingCount: ctx.missing?.length ?? 0,
  });

  if (!ctx.missing || ctx.missing.length === 0) {
    clearPlanningDraft(draft.cookerAddress);
    const run = saveRun({
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
    markReadyForPrep(draft.cookerAddress, run.id);
    return run;
  }

  const result = runMerchantAgent(ctx);
  if (result.ok) {
    clearPlanningDraft(draft.cookerAddress);
    const run = saveRun({
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
    markReadyForPrep(draft.cookerAddress, run.id);
    return run;
  }
  // Keep recipe context as idle so belanja sendiri / mulai masak still work
  const failStatus =
    result.reason === "no_merchant" ? "no_merchant" : "failed";
  const failed = saveRun({
    id,
    goal,
    pantry: draft.userBahan,
    steps: ctx.steps,
    intent: "known_dish",
    status: failStatus,
    selectedDish: draft.dish,
    plan: draft.plan,
    missing: draft.missing,
    createdAt,
  });
  setPlanningDraft({
    ...draft,
    phase: "idle",
    updatedAt: new Date().toISOString(),
  });
  clearPendingStartPrep(draft.cookerAddress);
  setLastReadyRun(draft.cookerAddress, failed.id);
  return failed;
}

/** Run finalizeQuote; map merchant failure to idle handoff (not raw 400). */
function finalizeQuoteResult(
  draft: PlanningDraft,
  goal: string,
  lang: ReplyLang,
): DishFlowResult {
  const run = finalizeQuote(draft, goal);
  if (
    (run.status === "no_merchant" || run.status === "failed") &&
    (run.plan || draft.plan)
  ) {
    return {
      type: "idle",
      dish: draft.dish,
      message: noMerchantIdleMessage(
        draft.dish,
        run.status === "no_merchant" ? "no_merchant" : "failed",
        lang,
      ),
      plan: draft.plan ?? run.plan,
      missing: draft.missing ?? run.missing,
      userBahan: draft.userBahan,
    };
  }
  return { type: "run", run };
}

/**
 * After suggestion pick (click or chat match): plan + gap using pantry chips,
 * then ask_quote if missing (no ask_bahan).
 */
export async function beginCommercePick(opts: {
  cookerAddress: string;
  dish: string;
  pantry: string[];
  goal: string;
}): Promise<DishFlowResult> {
  const address = opts.cookerAddress.toLowerCase();
  const lang = detectReplyLang(opts.goal);
  const carried = getLastPlanningPantry(address);
  const userBahan = normalizePantryTags([...(opts.pantry ?? []), ...carried]);
  clearPlanningDraft(address);

  try {
    const { plan, missing } = await planAndGap(opts.dish, userBahan);
    if (missing.length === 0) {
      const draft: PlanningDraft = {
        cookerAddress: address,
        dish: opts.dish,
        phase: "idle",
        userBahan,
        plan,
        missing: [],
        updatedAt: new Date().toISOString(),
      };
      return { type: "run", run: saveCookableRun(draft, opts.goal) };
    }
    setPlanningDraft({
      cookerAddress: address,
      dish: opts.dish,
      phase: "ask_quote",
      userBahan,
      plan,
      missing,
      updatedAt: new Date().toISOString(),
    });
    return {
      type: "ask_quote",
      dish: opts.dish,
      message: askQuoteMessage(opts.dish, missing, lang),
      plan,
      missing,
      userBahan,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      type: "run",
      run: saveRun({
        id: newId("run"),
        goal: opts.goal,
        pantry: userBahan,
        steps: [
          {
            tool: "plan_recipe",
            error: message,
            at: new Date().toISOString(),
          },
        ],
        intent: "known_dish",
        status: "failed",
        selectedDish: opts.dish,
        createdAt: new Date().toISOString(),
      }),
    };
  }
}

/**
 * Multi-turn dish → bahan → confirm gap → optional quote → idle.
 * Returns passthrough for pantry_first / selectedDish / non-dish goals.
 */
export async function handleDishPlanningTurn(opts: {
  cookerAddress: string;
  goal: string;
  selectedDish?: string;
}): Promise<DishFlowResult> {
  const address = opts.cookerAddress.toLowerCase();
  const goal = opts.goal.trim();
  const lang = detectReplyLang(goal);

  // Suggestion pick → existing orchestrator commerce path
  if (opts.selectedDish?.trim()) {
    clearPlanningDraft(address);
    return { type: "passthrough" };
  }

  const ruleIntent = classifyIntentRules(goal);
  const draft = getPlanningDraft(address);

  // Off-topic / mood / gibberish: never advance any planning phase
  // (must run BEFORE pantry_first, which would clear the draft)
  if (draft) {
    const clearIntent =
      isStartPrep(goal) ||
      isSkipQuote(goal) ||
      isWantQuoteExplicit(goal) ||
      isAffirmative(goal) ||
      isNegative(goal) ||
      looksLikeBareDish(goal) ||
      ruleIntent === "known_dish";
    if (
      isOffTopicByRules(goal) ||
      (!clearIntent && (await isOffTopicUtterance(goal)))
    ) {
      return stayOnPhase(draft, lang);
    }
    // pantry_first cue + nonsense payload (e.g. "cuma punya magerrr")
    if (
      ruleIntent === "pantry_first" &&
      pantryFirstPayloadIsOffTopic(goal)
    ) {
      return stayOnPhase(draft, lang);
    }
  }

  // Real pantry-first: clear draft and let orchestrator suggest
  if (ruleIntent === "pantry_first") {
    clearPlanningDraft(address);
    return { type: "passthrough" };
  }

  // --- ask_quote: want merchant quote or buy own ---
  if (draft?.phase === "ask_quote") {
    let want = isWantQuote(goal);
    let skip = isSkipQuote(goal);
    if (!want && !skip) {
      const c = await classifyConfirmIntent(goal, "ask_quote");
      if (c === "yes") want = true;
      else if (c === "no") skip = true;
    }
    if (want) {
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
          message: reaskBahanMessage(draft.dish, lang),
        };
      }
      return finalizeQuoteResult(draft, goal, lang);
    }
    if (skip) {
      clearPendingStartPrep(address);
      setPlanningDraft({ ...draft, phase: "idle" });
      return {
        type: "idle",
        dish: draft.dish,
        message: idleMessage(draft.dish, lang),
        plan: draft.plan,
        missing: draft.missing,
        userBahan: draft.userBahan,
      };
    }
    return {
      type: "ask_quote",
      dish: draft.dish,
      message: askQuoteMessage(draft.dish, draft.missing ?? [], lang),
      plan: draft.plan!,
      missing: draft.missing ?? [],
      userBahan: draft.userBahan,
    };
  }

  // --- idle: remember last dish/plan until next intent ---
  if (draft?.phase === "idle") {
    if (isSkipQuote(goal)) {
      clearPendingStartPrep(address);
      return {
        type: "idle",
        dish: draft.dish,
        message: idleMessage(draft.dish, lang),
        plan: draft.plan,
        missing: draft.missing,
        userBahan: draft.userBahan,
      };
    }
    const wantQuote =
      isWantQuoteExplicit(goal) ||
      (Boolean(draft.missing?.length) && looksQuoteIsh(goal));
    if (wantQuote) {
      clearPendingStartPrep(address);
      if (!draft.plan || !(draft.missing && draft.missing.length > 0)) {
        if (draft.plan) {
          return { type: "run", run: saveCookableRun(draft, goal) };
        }
        return {
          type: "idle",
          dish: draft.dish,
          message: idleNudge(draft.dish, lang),
          plan: draft.plan,
          missing: draft.missing,
          userBahan: draft.userBahan,
        };
      }
      return finalizeQuoteResult(draft, goal, lang);
    }
    if (isStartPrep(goal)) {
      if (!draft.plan) {
        return {
          type: "ask_bahan",
          dish: draft.dish,
          message: reaskBahanMessage(draft.dish, lang),
        };
      }
      const run = saveCookableRun(draft, goal);
      return { type: "run", run };
    }
    // New dish name → restart ask_bahan for that dish
    if (ruleIntent === "known_dish" || looksLikeBareDish(goal)) {
      const dish = extractDishName(goal);
      const sameDish =
        dish.toLowerCase() === draft.dish.toLowerCase() ||
        goal.toLowerCase() === draft.dish.toLowerCase();
      if (!sameDish) {
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
              message: formatGapMessage(dish, inline, missing, lang),
              plan,
              missing,
              userBahan: inline,
            };
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
              type: "run",
              run: saveRun({
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
              }),
            };
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
          message: askBahanMessage(dish, lang),
        };
      }
    }
    return {
      type: "idle",
      dish: draft.dish,
      message: idleNudge(draft.dish, lang),
      plan: draft.plan,
      missing: draft.missing,
      userBahan: draft.userBahan,
    };
  }

  // --- Continue confirm_gap ---
  if (draft?.phase === "confirm_gap") {
    const confirm = await classifyConfirmIntent(goal, "confirm_gap");
    if (confirm === "yes") {
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
          message: reaskBahanMessage(draft.dish, lang),
        };
      }
      const missing = draft.missing ?? [];
      if (missing.length === 0) {
        return { type: "run", run: saveCookableRun(draft, goal) };
      }
      setPlanningDraft({ ...draft, phase: "ask_quote" });
      return {
        type: "ask_quote",
        dish: draft.dish,
        message: askQuoteMessage(draft.dish, missing, lang),
        plan: draft.plan,
        missing,
        userBahan: draft.userBahan,
      };
    }
    if (confirm === "no") {
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
        message: reaskBahanMessage(draft.dish, lang),
      };
    }
    return {
      type: "confirm_gap",
      dish: draft.dish,
      message: pickCopy(
        lang,
        `Apakah daftar bahan / kekurangan untuk **${draft.dish}** sudah benar? Bilang **ya** atau **tidak**.`,
        `Is the ingredient / missing list for **${draft.dish}** correct? Say **yes** or **no**.`,
      ),
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
        message: askBahanMessage(draft.dish, lang),
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
        message: formatGapMessage(draft.dish, bahan, missing, lang),
        plan,
        missing,
        userBahan: bahan,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const run = saveRun({
        id: newId("run"),
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
          message: formatGapMessage(dish, inline, missing, lang),
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
      message: askBahanMessage(dish, lang),
    };
  }

  return { type: "passthrough" };
}
