/**
 * Smoke: cook session message router (no HTTP).
 * npx tsx scripts/smoke-session-message.ts
 */
import { handleSessionMessage, buildPrepChecks } from "../src/cooker/session-message.js";
import type { CookingSession } from "../src/store.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const base: CookingSession = {
  id: "cook_test",
  cookerAddress: "0xabc",
  status: "prep",
  dish: "Ayam Semur",
  plan: {
    dish: "Ayam Semur",
    steps: ["Marinate", "Sauté", "Simmer"],
    ingredients: [
      { tag: "chicken", name: "Chicken", qty: 1, unit: "pcs" },
      { tag: "salt", name: "Salt", qty: 1, unit: "tsp" },
    ],
  },
  prepChecks: buildPrepChecks([
    { tag: "chicken" },
    { tag: "salt" },
  ]),
  stepIndex: 0,
  pendingConfirm: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let s = { ...base, prepChecks: { ...base.prepChecks } };

let r = handleSessionMessage(s, "semua siap");
assert(Object.values(r.session.prepChecks).every(Boolean), "all ready");

r = handleSessionMessage(r.session, "mulai masak");
assert(r.session.status === "cooking", "cooking");
assert(r.cookStep?.index === 0, "step 0");

r = handleSessionMessage(r.session, "lanjut");
assert(r.cookStep?.index === 1, "step 1");

r = handleSessionMessage(r.session, "ganti menu");
assert(r.session.pendingConfirm === "abandon_replan", "confirm");

r = handleSessionMessage(r.session, "ya");
assert(r.session.status === "abandoned", "abandoned");
assert(r.handoff, "handoff");

console.log("session-message smoke OK");
