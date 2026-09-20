/**
 * Smoke: idle “mau quote” after belanja sendiri; prep pending must not steal.
 * npx tsx scripts/smoke-idle-quote.ts
 */
import {
  handleDishPlanningTurn,
  isWantQuoteExplicit,
  isStartPrep,
} from "../src/agent/dish-flow.js";
import {
  clearPlanningMemory,
  getPendingStartPrepRunId,
  getPlanningDraft,
  markReadyForPrep,
  newId,
  saveRun,
  setPlanningDraft,
} from "../src/store.js";
import { seedIfEmpty } from "../src/seed.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  seedIfEmpty();
  const addr = "0xsmoke_idle_quote";
  clearPlanningMemory(addr);

  assert(isWantQuoteExplicit("mau quote"), "mau quote explicit");
  assert(isWantQuoteExplicit("quote dong"), "quote dong");
  assert(isWantQuoteExplicit("jadi mau quote"), "jadi mau quote");
  assert(isWantQuoteExplicit("want quote"), "want quote");
  assert(!isWantQuoteExplicit("ya"), "bare ya is not explicit quote");
  assert(!isWantQuoteExplicit("ok"), "ok is not explicit quote");
  assert(isStartPrep("mulai"), "mulai is start prep");

  const plan = {
    dish: "Soto Ayam",
    steps: ["Rebus", "Sajikan"],
    ingredients: [
      { tag: "chicken", name: "Ayam", qty: 1, unit: "pcs" },
      { tag: "salt", name: "Garam", qty: 1, unit: "tsp" },
    ],
  };
  const missing = [{ tag: "salt", name: "Garam", qty: 1, unit: "tsp" }];

  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "idle",
    userBahan: ["chicken"],
    plan,
    missing,
    updatedAt: new Date().toISOString(),
  });

  // Leftover pending prep must not block quote
  const decoy = newId("run");
  saveRun({
    id: decoy,
    goal: "decoy",
    pantry: [],
    steps: [],
    intent: "known_dish",
    status: "cookable",
    selectedDish: "Nasi Goreng",
    plan: {
      dish: "Nasi Goreng",
      steps: ["Tumis"],
      ingredients: [{ tag: "rice", name: "Nasi", qty: 1, unit: "porsi" }],
    },
    missing: [],
    createdAt: new Date().toISOString(),
  });
  markReadyForPrep(addr, decoy);
  assert(getPendingStartPrepRunId(addr) === decoy, "pending set");

  const turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "mau quote",
  });
  assert(turn.type === "run", `expected run got ${turn.type}`);
  if (turn.type !== "run") throw new Error("not run");
  assert(
    turn.run.selectedDish === "Soto Ayam" || turn.run.plan?.dish === "Soto Ayam",
    `should stay Soto Ayam, got ${turn.run.plan?.dish}`,
  );
  assert(
    turn.run.status === "quoted" ||
      turn.run.status === "cookable" ||
      turn.run.status === "no_merchant" ||
      turn.run.status === "failed",
    `quote path status ${turn.run.status}`,
  );
  assert(turn.run.plan?.dish !== "Nasi Goreng", "must not invent Nasi Goreng");
  assert(!getPlanningDraft(addr), "draft cleared after finalizeQuote");
  // New quoted/cookable run may re-arm pending — must not keep decoy Nasi Goreng
  assert(
    getPendingStartPrepRunId(addr) !== decoy,
    "decoy pending must not remain after quote",
  );

  // Skip → idle clears pending
  clearPlanningMemory(addr);
  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "ask_quote",
    userBahan: ["chicken"],
    plan,
    missing,
    updatedAt: new Date().toISOString(),
  });
  markReadyForPrep(addr, decoy);
  const skip = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "belanja sendiri",
  });
  assert(skip.type === "idle", `expected idle got ${skip.type}`);
  assert(!getPendingStartPrepRunId(addr), "pending cleared on belanja sendiri");
  assert(getPlanningDraft(addr)?.phase === "idle", "now idle");

  const again = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "mau quote",
  });
  assert(again.type === "run", "quote after change of mind");
  if (again.type === "run") {
    assert(
      again.run.plan?.dish === "Soto Ayam",
      "still Soto after change of mind",
    );
  }

  console.log("smoke-idle-quote OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
