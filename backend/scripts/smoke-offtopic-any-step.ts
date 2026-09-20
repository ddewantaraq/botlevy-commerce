/**
 * Smoke: off-topic at any planning step stays in phase (no Magerrr quote).
 * npx tsx scripts/smoke-offtopic-any-step.ts
 */
import { handleDishPlanningTurn } from "../src/agent/dish-flow.js";
import {
  gatePlanningRequest,
  isOffTopicByRules,
} from "../src/agent/planning-gate.js";
import {
  clearPlanningMemory,
  getPlanningDraft,
  setPlanningDraft,
} from "../src/store.js";
import { seedIfEmpty } from "../src/seed.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  seedIfEmpty();
  const addr = "0xsmoke_offtopic_any";
  clearPlanningMemory(addr);

  assert(isOffTopicByRules("mager"), "mager rules");
  assert(isOffTopicByRules("magerrr"), "magerrr rules");
  assert(isOffTopicByRules("magerrrrr"), "magerrrrr rules");
  assert(!isOffTopicByRules("soto ayam"), "soto not off-topic");
  assert(!isOffTopicByRules("mau quote"), "mau quote not off-topic");

  const noDraft = await gatePlanningRequest("magerrr");
  assert(noDraft.kind === "off_topic", "no-draft gate off_topic");

  const plan = {
    dish: "Soto Ayam",
    steps: ["Rebus"],
    ingredients: [{ tag: "chicken", name: "Ayam", qty: 1, unit: "pcs" }],
  };
  const missing = [{ tag: "salt", name: "Garam", qty: 1, unit: "tsp" }];

  // ask_quote + mager → stay ask_quote
  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "ask_quote",
    userBahan: ["chicken"],
    plan,
    missing,
    updatedAt: new Date().toISOString(),
  });
  let turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "magerrr",
  });
  assert(turn.type === "ask_quote", `ask_quote stay got ${turn.type}`);
  assert(getPlanningDraft(addr)?.phase === "ask_quote", "draft still ask_quote");
  assert(!/Magerr/i.test(JSON.stringify(turn)), "no Magerr dish");

  // idle + mager → stay idle
  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "idle",
    userBahan: ["chicken"],
    plan,
    missing,
    updatedAt: new Date().toISOString(),
  });
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "mager",
  });
  assert(turn.type === "idle", `idle stay got ${turn.type}`);
  assert(getPlanningDraft(addr)?.phase === "idle", "draft still idle");

  // confirm_gap + mager → stay confirm_gap
  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "confirm_gap",
    userBahan: ["chicken"],
    plan,
    missing,
    updatedAt: new Date().toISOString(),
  });
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "magerrr",
  });
  assert(turn.type === "confirm_gap", `confirm_gap stay got ${turn.type}`);

  // await_bahan + mager → stay ask_bahan
  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "await_bahan",
    userBahan: [],
    updatedAt: new Date().toISOString(),
  });
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "mager",
  });
  assert(turn.type === "ask_bahan", `await_bahan stay got ${turn.type}`);

  // Real intent still works on ask_quote
  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "ask_quote",
    userBahan: ["chicken"],
    plan,
    missing,
    updatedAt: new Date().toISOString(),
  });
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "belanja sendiri",
  });
  assert(turn.type === "idle", "belanja sendiri still works");

  // pantry_first cue + nonsense payload must NOT clear draft
  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "ask_quote",
    userBahan: ["chicken"],
    plan,
    missing,
    updatedAt: new Date().toISOString(),
  });
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "cuma punya magerrr",
  });
  assert(
    turn.type === "ask_quote",
    `cuma punya magerrr stay ask_quote got ${turn.type}`,
  );
  assert(
    getPlanningDraft(addr)?.phase === "ask_quote",
    "draft not cleared by fake pantry_first",
  );

  // Real pantry_first mid-flow still passthrough
  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "ask_quote",
    userBahan: ["chicken"],
    plan,
    missing,
    updatedAt: new Date().toISOString(),
  });
  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "cuma punya ayam",
  });
  assert(turn.type === "passthrough", `real pantry_first got ${turn.type}`);
  assert(!getPlanningDraft(addr), "draft cleared for real pantry_first");

  turn = await handleDishPlanningTurn({
    cookerAddress: addr,
    goal: "enak apa",
  });
  // no draft now — pantry_first still passthrough when no draft
  assert(turn.type === "passthrough", "enak apa passthrough");

  console.log("smoke-offtopic-any-step OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
