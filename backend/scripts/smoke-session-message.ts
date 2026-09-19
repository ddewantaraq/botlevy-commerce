/**
 * Smoke: cook session message router (no HTTP).
 * npx tsx scripts/smoke-session-message.ts
 */
import {
  handleSessionMessage,
  buildPrepChecks,
  formatPrepIntro,
  normalizeUtterance,
} from "../src/cooker/session-message.js";
import { listCookerMenus } from "../src/store.js";
import type { CookingSession } from "../src/store.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function fresh(): CookingSession {
  return {
    id: "cook_test",
    cookerAddress: "0xabc",
    status: "prep",
    dish: "Sapi Tumis Bawang",
    plan: {
      dish: "Sapi Tumis Bawang",
      steps: ["Marinate", "Sauté", "Simmer"],
      ingredients: [
        { tag: "beef", name: "Beef", qty: 1, unit: "pcs" },
        { tag: "salt", name: "Salt", qty: 1, unit: "tsp" },
      ],
    },
    prepChecks: buildPrepChecks([{ tag: "beef" }, { tag: "salt" }]),
    stepIndex: 0,
    pendingConfirm: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  assert(
    normalizeUtterance("Mulai masak.") === "mulai masak",
    "normalize punctuation",
  );

  // Prep copy: names not tags; no Centang di chat
  const soto: CookingSession = {
    id: "cook_soto",
    cookerAddress: "0xabc",
    status: "prep",
    dish: "Soto Sapi",
    plan: {
      dish: "Soto Sapi",
      steps: ["Rebus", "Sajikan"],
      ingredients: [
        { tag: "bay_leaf", name: "Daun salam", qty: 2, unit: "lembar" },
        { tag: "beef", name: "Daging sapi", qty: 300, unit: "g" },
      ],
    },
    prepChecks: buildPrepChecks([{ tag: "bay_leaf" }, { tag: "beef" }]),
    stepIndex: 0,
    pendingConfirm: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const intro = formatPrepIntro(soto);
  assert(/Daun salam/.test(intro), "shows ingredient name Daun salam");
  assert(/Daging sapi/.test(intro), "shows ingredient name Daging sapi");
  assert(!/\bbay_leaf\b/.test(intro), "does not show raw tag bay_leaf");
  assert(!/Centang di chat/i.test(intro), "no Centang di chat");
  assert(
    /bilang atau ketik \*\*mulai masak\*\*/i.test(intro),
    "speak/chat mulai masak instruction",
  );

  let s = fresh();
  let r = await handleSessionMessage(s, "semua siap");
  assert(Object.values(r.session.prepChecks).every(Boolean), "all ready");

  r = await handleSessionMessage(r.session, "Mulai masak.");
  assert(r.session.status === "cooking", "Mulai masak. → cooking");
  assert(r.cookStep?.index === 0, "step 0");

  s = fresh();
  r = await handleSessionMessage(s, "mulai memasak");
  assert(r.session.status === "cooking", "mulai memasak → cooking");

  // start must win before any tag heuristic
  s = fresh();
  r = await handleSessionMessage(s, "mulai masak");
  assert(r.session.status === "cooking", "mulai masak before tags");

  r = await handleSessionMessage(r.session, "lanjut");
  assert(r.cookStep?.index === 1, "step 1");

  r = await handleSessionMessage(r.session, "balik ya");
  assert(r.cookStep?.index === 0, "balik ya → back");

  r = await handleSessionMessage(r.session, "ulangi step sebelumnya");
  assert(r.cookStep?.index === 0, "ulangi…sebelumnya stays/back at 0");

  r = await handleSessionMessage(r.session, "lanjut");
  r = await handleSessionMessage(r.session, "balik step sebelumnya gimana");
  assert(r.cookStep?.index === 0, "balik step sebelumnya");

  r = await handleSessionMessage(r.session, "ganti menu");
  assert(r.session.pendingConfirm === "abandon_replan", "confirm");

  r = await handleSessionMessage(r.session, "ya");
  assert(r.session.status === "abandoned", "abandoned");
  assert(r.handoff, "handoff");

  // Last step → post_cook (not done)
  s = fresh();
  r = await handleSessionMessage(s, "mulai masak");
  r = await handleSessionMessage(r.session, "lanjut");
  r = await handleSessionMessage(r.session, "lanjut");
  r = await handleSessionMessage(r.session, "lanjut");
  assert(r.session.status === "post_cook", "last step → post_cook");
  assert(!/ayam semur/i.test(r.reply), "no ayam semur in post_cook reply");

  // Save from post_cook
  r = await handleSessionMessage(r.session, "ya simpan menunya ya");
  assert(r.session.status === "done", "save → done");
  assert(/Sapi Tumis Bawang/.test(r.reply), "saved dish name");
  assert(r.handoff, "handoff after save");
  const menus = listCookerMenus("0xabc");
  assert(
    menus.some((m) => m.dish === "Sapi Tumis Bawang"),
    "menu persisted",
  );

  // Mid-cook stop → confirm, not abandoned yet
  s = fresh();
  r = await handleSessionMessage(s, "mulai masak");
  r = await handleSessionMessage(r.session, "berhenti");
  assert(r.session.pendingConfirm === "abandon_replan", "stop confirms");
  assert(r.session.status === "cooking", "still cooking until yes");
  r = await handleSessionMessage(r.session, "tidak");
  assert(r.session.pendingConfirm == null, "cancel confirm");
  assert(r.session.status === "cooking", "stay cooking");

  console.log("session-message smoke OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
