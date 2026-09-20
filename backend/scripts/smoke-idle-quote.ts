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
  assert(isWantQuoteExplicit("cek harga"), "cek harga explicit");
  assert(isWantQuoteExplicit("minta harga dong"), "minta harga dong");
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
  // Success → run (quoted/cookable); no stock → idle with draft kept
  if (turn.type === "idle") {
    assert(
      turn.dish === "Soto Ayam",
      `idle after quote fail should stay Soto, got ${turn.dish}`,
    );
    assert(
      getPlanningDraft(addr)?.phase === "idle",
      "no_merchant keeps idle draft",
    );
    assert(
      getPendingStartPrepRunId(addr) !== decoy,
      "decoy pending must not remain after quote fail",
    );
    const selfBuy = await handleDishPlanningTurn({
      cookerAddress: addr,
      goal: "belanja sendiri",
    });
    assert(selfBuy.type === "idle", `belanja sendiri → idle got ${selfBuy.type}`);
    assert(
      /belanja sendiri|buy yourself|mulai masak|start cooking/i.test(
        selfBuy.type === "idle" ? selfBuy.message : "",
      ),
      "idle ack after belanja sendiri",
    );
  } else {
    assert(turn.type === "run", `expected run got ${turn.type}`);
    if (turn.type !== "run") throw new Error("not run");
    assert(
      turn.run.selectedDish === "Soto Ayam" ||
        turn.run.plan?.dish === "Soto Ayam",
      `should stay Soto Ayam, got ${turn.run.plan?.dish}`,
    );
    assert(
      turn.run.status === "quoted" || turn.run.status === "cookable",
      `quote path status ${turn.run.status}`,
    );
    assert(turn.run.plan?.dish !== "Nasi Goreng", "must not invent Nasi Goreng");
    assert(!getPlanningDraft(addr), "draft cleared after successful quote");
    assert(
      getPendingStartPrepRunId(addr) !== decoy,
      "decoy pending must not remain after quote",
    );
  }

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

  // Idle + belanja sendiri again → still idle ack (no gate)
  const skipAgain = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "belanja sendiri",
  });
  assert(skipAgain.type === "idle", "idle belanja sendiri stays idle");

  const again = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "mau quote",
  });
  assert(
    again.type === "run" || again.type === "idle",
    `quote after change of mind got ${again.type}`,
  );
  if (again.type === "run") {
    assert(
      again.run.plan?.dish === "Soto Ayam",
      "still Soto after change of mind",
    );
  } else if (again.type === "idle") {
    assert(again.dish === "Soto Ayam", "still Soto idle after quote fail");
    assert(getPlanningDraft(addr)?.phase === "idle", "idle draft after fail");
  }

  console.log("smoke-idle-quote OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
