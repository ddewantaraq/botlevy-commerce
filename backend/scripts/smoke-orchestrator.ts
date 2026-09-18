/**
 * Offline smoke test for orchestrator paths (no HTTP / SIWE).
 * Usage: npx tsx scripts/smoke-orchestrator.ts
 */
import { seedIfEmpty } from "../src/seed.js";
import { runOrchestrator } from "../src/agent/orchestrator/execute.js";
import { suggestProductTags } from "../src/agent/subagents/catalog-assist.js";
import { hasOllamaKey } from "../src/agent/llm/client.js";
import { RECIPE_TRY_AGAIN, toolPlanRecipe } from "../src/agent/tools/recipe.js";
import { gatePlanningRequest } from "../src/agent/planning-gate.js";
import {
  getMerchant,
  isRealPayTo,
  upsertMerchant,
} from "../src/store.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  seedIfEmpty();

  // Ensure a real payTo so quoted / no_merchant paths are distinguishable
  const seed = getMerchant("m_warung_sehat");
  if (seed && !isRealPayTo(seed.payTo)) {
    upsertMerchant({
      ...seed,
      payTo: "0x1111111111111111111111111111111111111111",
      updatedAt: new Date().toISOString(),
    });
  }

  console.log("A) plan_recipe failure → try again (no Ayam Semur fallback)");
  try {
    await toolPlanRecipe("I want to cook ayam semur tonight");
    if (!hasOllamaKey()) {
      throw new Error("expected toolPlanRecipe to throw without OLLAMA_API_KEY");
    }
    console.log("   (OLLAMA present — live plan ok, skip throw assert)");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg === RECIPE_TRY_AGAIN, `expected try-again message, got: ${msg}`);
    assert(!/ayam semur/i.test(msg), "must not mention ayam semur fallback");
    console.log("   failed with try-again message OK");
  }

  if (!hasOllamaKey()) {
    const failed = await runOrchestrator({
      goal: "I want to cook ayam semur tonight",
      pantry: ["salt"],
    });
    assert(failed.status === "failed", `expected failed, got ${failed.status}`);
    const lastErr = [...failed.steps].reverse().find((s) => s.error)?.error;
    assert(
      lastErr === RECIPE_TRY_AGAIN,
      `expected RECIPE_TRY_AGAIN on run, got ${lastErr}`,
    );
    assert(!failed.plan, "failed run must not invent a plan");
    console.log("   orchestrator failed without fake plan OK");
  } else {
    console.log("B) known dish → quoted|cookable|failed (live Ollama)");
    const a = await runOrchestrator({
      goal: "I want to cook ayam semur tonight",
      pantry: ["salt"],
    });
    console.log("   ", a.status, a.intent, a.steps.map((s) => s.tool).join(" → "));
    assert(
      ["quoted", "cookable", "failed", "no_merchant"].includes(a.status),
      `unexpected ${a.status}`,
    );

    console.log("C) pantry_first → suggestions|failed");
    const b = await runOrchestrator({
      goal: "Saya cuma punya daging sapi dan bawang, enak apa ya?",
      pantry: ["beef", "onion"],
    });
    console.log("   ", b.status, b.intent, "suggestions=", b.suggestions?.length);
    assert(
      b.status === "suggestions" || b.status === "failed",
      `expected suggestions|failed, got ${b.status}`,
    );
  }

  console.log("D) planning gate: stop / off_topic / save_without_session");
  const stop = await gatePlanningRequest("stop");
  assert(stop.kind === "stop", `stop → ${stop.kind}`);
  assert(stop.reply, "stop reply");

  const save = await gatePlanningRequest("ya simpan menunya ya");
  assert(
    save.kind === "save_without_session",
    `save without session → ${save.kind}`,
  );

  const cook = await gatePlanningRequest("Saya mau masak tumis sapi bawang");
  assert(cook.kind === "cooking_request", `cooking → ${cook.kind}`);

  console.log("E) catalog assist tags");
  const e = await suggestProductTags({ name: "Daging Sapi Fresh" });
  console.log("   ", e.source, e.tags);
  assert(e.tags.length >= 1, "expected tags");

  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
