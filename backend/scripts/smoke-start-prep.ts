/**
 * Smoke: spoken mulai starts prep for the ready dish (not a new orchestrator menu).
 * npx tsx scripts/smoke-start-prep.ts
 */
import { isStartPrep } from "../src/agent/dish-flow.js";
import { startPrepSession } from "../src/cooker/start-prep.js";
import {
  clearPlanningMemory,
  getActiveCookingSession,
  getLastReadyRunId,
  getPendingStartPrepRunId,
  getPlanningDraft,
  markReadyForPrep,
  newId,
  saveRun,
  setPlanningDraft,
} from "../src/store.js";
import { seedIfEmpty } from "../src/seed.js";
import { handleDishPlanningTurn } from "../src/agent/dish-flow.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  seedIfEmpty();
  const addr = "0xsmoke_start_prep";
  clearPlanningMemory(addr);

  assert(isStartPrep("mulai"), "mulai is start prep");
  assert(isStartPrep("mulai masak"), "mulai masak is start prep");
  assert(isStartPrep("ya") === false, "bare ya is not isStartPrep");

  const sotoPlan = {
    dish: "Soto Ayam",
    steps: ["Rebus ayam", "Sajikan"],
    ingredients: [
      { tag: "chicken", name: "Ayam", qty: 1, unit: "pcs" },
      { tag: "salt", name: "Garam", qty: 1, unit: "tsp" },
    ],
  };

  // Idle draft + mulai → cookable marked ready, then start prep for Soto
  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "idle",
    userBahan: ["chicken", "salt"],
    plan: sotoPlan,
    missing: [],
    updatedAt: new Date().toISOString(),
  });

  const turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "mulai",
  });
  assert(turn.type === "run", `expected run got ${turn.type}`);
  assert(turn.type === "run" && turn.run.status === "cookable", "cookable");
  assert(
    turn.type === "run" && turn.run.plan?.dish === "Soto Ayam",
    "still Soto Ayam",
  );
  assert(!getPlanningDraft(addr), "draft cleared on cookable");
  assert(getLastReadyRunId(addr) === turn.run.id, "last ready set");
  assert(getPendingStartPrepRunId(addr) === turn.run.id, "pending set");

  const started = startPrepSession({ address: addr, runId: turn.run.id });
  assert(started.ok, "start prep ok");
  if (!started.ok) throw new Error(started.message);
  assert(started.session.dish === "Soto Ayam", "prep session is Soto Ayam");
  assert(started.session.status === "prep", "status prep");
  assert(
    getActiveCookingSession(addr)?.id === started.session.id,
    "active session",
  );
  assert(!getPendingStartPrepRunId(addr), "pending cleared after start");

  // Follow-up path: cookable pending + mulai without draft
  clearPlanningMemory(addr);
  const runId = newId("run");
  saveRun({
    id: runId,
    goal: "mulai masak",
    pantry: ["chicken"],
    steps: [],
    intent: "known_dish",
    status: "cookable",
    selectedDish: "Soto Ayam",
    plan: sotoPlan,
    missing: [],
    createdAt: new Date().toISOString(),
  });
  markReadyForPrep(addr, runId);
  const again = startPrepSession({ address: addr, runId });
  assert(again.ok && again.session.dish === "Soto Ayam", "second mulai Soto");
  assert(again.ok && again.session.dish !== "Nasi Goreng", "not Nasi Goreng");

  console.log("smoke-start-prep OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
