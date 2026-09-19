/**
 * Smoke: dish→bahan→confirm→optional quote/idle + pantry-first regression.
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

  let turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "soto ayam",
  });
  assert(turn.type === "ask_bahan", `expected ask_bahan, got ${turn.type}`);
  assert(getPlanningDraft(addr)?.phase === "await_bahan", "draft await");

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
  } else {
    assert(
      pantry.status === "failed" || pantry.status === "suggestions",
      "no key ok",
    );
  }
  assert(!getPlanningDraft(addr), "no draft after pantry-first");

  clearPlanningDraft(addr);
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "soto ayam",
  });
  assert(turn.type === "ask_bahan", "ask again");

  if (!hasOllamaKey()) {
    console.log("skip live bahan→quote (no OLLAMA_API_KEY)");
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

  // Reject gap → re-ask bahan
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "tidak",
  });
  assert(turn.type === "ask_bahan", "tidak → reask bahan");

  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "ayam, bawang, kunyit, garam, minyak goreng",
  });
  assert(turn.type === "confirm_gap", "confirm again");
  const hadGap =
    turn.type === "confirm_gap" && (turn.missing?.length ?? 0) > 0;

  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "ya",
  });

  if (hadGap) {
    assert(turn.type === "ask_quote", `ya+gap → ask_quote, got ${turn.type}`);
    assert(getPlanningDraft(addr)?.phase === "ask_quote", "phase ask_quote");

    // Skip quote → idle
    turn = await handleDishPlanningTurn({
      cookerAddress: addr,
      goal: "tidak",
    });
    assert(turn.type === "idle", `skip quote → idle, got ${turn.type}`);
    assert(getPlanningDraft(addr)?.phase === "idle", "draft idle");
    assert(getPlanningDraft(addr)?.plan, "plan retained idle");

    // Resume quote from idle
    turn = await handleDishPlanningTurn({
      cookerAddress: addr,
      goal: "mau quote",
    });
    assert(turn.type === "run", `mau quote → run, got ${turn.type}`);
    if (turn.type === "run") {
      assert(
        ["quoted", "cookable", "no_merchant", "failed"].includes(turn.run.status),
        `unexpected ${turn.run.status}`,
      );
    }
    assert(!getPlanningDraft(addr), "draft cleared after quote");
  } else {
    // No gap → cookable immediately
    assert(turn.type === "run", `ya+no gap → run, got ${turn.type}`);
    if (turn.type === "run") {
      assert(turn.run.status === "cookable", "cookable when no gap");
    }
  }

  // Second path: skip quote then mulai masak
  clearPlanningDraft(addr);
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "soto ayam",
  });
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "ayam saja",
  });
  if (turn.type === "confirm_gap" && (turn.missing?.length ?? 0) > 0) {
    turn = await handleDishPlanningTurn({ cookerAddress: addr, goal: "ya" });
    assert(turn.type === "ask_quote", "ask_quote again");
    turn = await handleDishPlanningTurn({
      cookerAddress: addr,
      goal: "belanja sendiri",
    });
    assert(turn.type === "idle", "belanja sendiri → idle");
    turn = await handleDishPlanningTurn({
      cookerAddress: addr,
      goal: "mulai masak",
    });
    assert(turn.type === "run", "mulai masak → run");
    if (turn.type === "run") {
      assert(turn.run.status === "cookable", "prep via cookable");
      assert(turn.run.plan, "plan on cookable run");
    }
    assert(!getPlanningDraft(addr), "cleared after prep");
  }

  console.log("smoke-dish-flow OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
