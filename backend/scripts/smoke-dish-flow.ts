/**
 * Smoke: dish→bahan→confirm + pantry-first regression + recipe normalize.
 * npx tsx scripts/smoke-dish-flow.ts
 */
import {
  extractDishName,
  extractInlineBahan,
  handleDishPlanningTurn,
  parseBahanList,
} from "../src/agent/dish-flow.js";
import { classifyIntentRules } from "../src/agent/subagents/classify-intent.js";
import {
  normalizeRecipePayload,
  RECIPE_TRY_AGAIN,
  toolPlanRecipe,
} from "../src/agent/tools/recipe.js";
import { hasOllamaKey } from "../src/agent/llm/client.js";
import { runOrchestrator } from "../src/agent/orchestrator/execute.js";
import {
  clearPlanningDraft,
  getPlanningDraft,
} from "../src/store.js";
import { seedIfEmpty } from "../src/seed.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  seedIfEmpty();
  const addr = "0xsmoke_dish_flow_aaa";

  clearPlanningDraft(addr);

  assert(
    classifyIntentRules("soto ayam") === "known_dish",
    "soto ayam → known_dish",
  );
  assert(
    classifyIntentRules(
      "Saya cuma punya daging sapi dan bawang, enak apa ya?",
    ) === "pantry_first",
    "pantry-first unchanged",
  );
  assert(
    classifyIntentRules(
      "cuma ada daging sapi dan bawang, enaknya dimasak apa?",
    ) === "pantry_first",
    "enaknya dimasak apa → pantry_first",
  );

  assert(extractDishName("soto ayam") === "Soto Ayam", "extract dish");
  assert(
    parseBahanList("ayam, bawang putih, dan kunyit").includes("ayam"),
    "parse bahan",
  );
  assert(
    (extractInlineBahan("soto ayam, bahan: ayam, bawang") ?? []).length >= 2,
    "inline bahan",
  );

  const normalized = normalizeRecipePayload({
    dish: "Soto Ayam",
    steps: ["Rebus"],
    bahan: [{ nama: "Ayam", qty: "500", satuan: "g" }],
  });
  const n = normalized as {
    ingredients: Array<{ tag: string; name: string; qty: number; unit: string }>;
  };
  assert(n.ingredients?.[0]?.tag === "ayam", "normalize tag from nama");
  assert(n.ingredients?.[0]?.qty === 500, "normalize qty string");
  assert(n.ingredients?.[0]?.unit === "g", "normalize unit");

  // Start ask_bahan
  let turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "soto ayam",
  });
  assert(turn.type === "ask_bahan", `expected ask_bahan, got ${turn.type}`);
  assert(getPlanningDraft(addr)?.phase === "await_bahan", "draft await");
  assert(!/ayam semur/i.test(turn.type === "ask_bahan" ? turn.message : ""), "no ayam semur");

  // Pantry-first must not leave ask_bahan draft hanging when user switches
  clearPlanningDraft(addr);
  const pantry = await runOrchestrator({
    goal: "Saya cuma punya daging sapi dan bawang, enak apa ya?",
    pantry: ["beef", "onion"],
  });
  if (hasOllamaKey()) {
    assert(
      pantry.status === "suggestions" || pantry.status === "failed",
      `pantry-first status ${pantry.status}`,
    );
    if (pantry.status === "suggestions") {
      assert((pantry.suggestions?.length ?? 0) >= 1, "suggestions present");
    }
  } else {
    // Without key menu agent fails → failed; still not ask_bahan path
    assert(pantry.status === "failed" || pantry.status === "suggestions", "no key ok");
  }
  assert(!getPlanningDraft(addr), "no draft after pantry-first orchestrator");

  // Full dish flow with bahan (needs Ollama for plan)
  clearPlanningDraft(addr);
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "soto ayam",
  });
  assert(turn.type === "ask_bahan", "ask again");

  if (!hasOllamaKey()) {
    console.log("skip live bahan→confirm (no OLLAMA_API_KEY)");
    try {
      await toolPlanRecipe("soto ayam");
      throw new Error("expected throw without key");
    } catch (err) {
      assert(
        err instanceof Error && err.message === RECIPE_TRY_AGAIN,
        "try again no fallback",
      );
    }
    console.log("smoke-dish-flow OK (partial, no ollama)");
    return;
  }

  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "ayam, bawang putih, kunyit, garam",
  });
  assert(turn.type === "confirm_gap", `expected confirm_gap, got ${turn.type}`);
  if (turn.type === "confirm_gap") {
    assert(turn.plan.dish, "has plan");
    assert(getPlanningDraft(addr)?.phase === "confirm_gap", "phase confirm");
  }

  // Reject → re-ask
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "tidak",
  });
  assert(turn.type === "ask_bahan", "tidak → reask bahan");
  assert(getPlanningDraft(addr)?.phase === "await_bahan", "back to await");

  // Bahan again then ya
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "ayam, bawang, kunyit, garam, minyak goreng",
  });
  assert(turn.type === "confirm_gap", "confirm again");

  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "ya",
  });
  assert(turn.type === "run", `ya → run, got ${turn.type}`);
  if (turn.type === "run") {
    assert(
      ["quoted", "cookable", "no_merchant", "failed"].includes(turn.run.status),
      `unexpected ${turn.run.status}`,
    );
  }
  assert(!getPlanningDraft(addr), "draft cleared after confirm");

  console.log("smoke-dish-flow OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
