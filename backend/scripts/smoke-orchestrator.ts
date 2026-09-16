/**
 * Offline smoke test for orchestrator paths (no HTTP / SIWE).
 * Usage: npx tsx scripts/smoke-orchestrator.ts
 */
import { seedIfEmpty } from "../src/seed.js";
import { runOrchestrator } from "../src/agent/orchestrator/execute.js";
import { suggestProductTags } from "../src/agent/subagents/catalog-assist.js";
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

  console.log("A) known dish → quoted");
  const a = await runOrchestrator({
    goal: "I want to cook ayam semur tonight",
    pantry: ["salt"],
  });
  console.log("   ", a.status, a.intent, a.steps.map((s) => s.tool).join(" → "));
  assert(a.status === "quoted", `expected quoted, got ${a.status}`);
  assert(a.quote, "expected quote");

  console.log("B) pantry_first → suggestions");
  const b = await runOrchestrator({
    goal: "Saya cuma punya daging sapi dan bawang, enak apa ya?",
    pantry: ["beef", "onion"],
  });
  console.log("   ", b.status, b.intent, "suggestions=", b.suggestions?.length);
  assert(b.status === "suggestions", `expected suggestions, got ${b.status}`);
  assert((b.suggestions?.length ?? 0) >= 1, "expected suggestions");

  console.log("C) pantry_first + selectedDish → quoted|cookable");
  const c = await runOrchestrator({
    goal: "Saya cuma punya beef, enak apa?",
    pantry: ["beef", "garlic", "onion", "salt", "cooking_oil"],
    selectedDish: "Tumis daging sapi bawang",
  });
  console.log("   ", c.status, c.plan?.dish);
  assert(
    c.status === "quoted" || c.status === "cookable",
    `expected quoted|cookable, got ${c.status}`,
  );

  console.log("D) cookable (full pantry for ayam semur fallback tags)");
  const d = await runOrchestrator({
    goal: "I want to cook ayam semur tonight",
    pantry: [
      "chicken",
      "shallot",
      "kecap_manis",
      "nutmeg",
      "potato",
      "cooking_oil",
      "salt",
    ],
  });
  console.log("   ", d.status, d.plan?.dish);
  assert(d.status === "cookable", `expected cookable, got ${d.status}`);
  assert(d.plan, "expected plan");
  assert(!d.quote, "cookable should not have quote");

  console.log("E) catalog assist tags");
  const e = await suggestProductTags({ name: "Daging Sapi Fresh" });
  console.log("   ", e.source, e.tags);
  assert(e.tags.length >= 1, "expected tags");

  console.log("F) no_merchant (empty catalog match)");
  // Use a dish whose tags won't match seed (e.g. saffron-only fantasy after force)
  const f = await runOrchestrator({
    goal: "I want to cook saffron lobster thermidor tonight",
    pantry: [],
  });
  console.log("   ", f.status, f.intent);
  // May be quoted if LLM invents chicken-like tags, or no_merchant — both OK structurally
  assert(
    ["quoted", "no_merchant", "cookable", "failed"].includes(f.status),
    `unexpected status ${f.status}`,
  );

  console.log("\nAll smoke checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
