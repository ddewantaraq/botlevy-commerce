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
    prepGuide: "ask",
    prepIndex: 0,
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

  // Intro: mode ask (not full checklist)
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
    prepGuide: "ask",
    prepIndex: 0,
    stepIndex: 0,
    pendingConfirm: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const intro = formatPrepIntro(soto);
  assert(/Soto Sapi/.test(intro), "intro names dish");
  assert(/satu-satu/i.test(intro), "intro offers satu-satu");
  assert(/mulai masak/i.test(intro), "intro mentions mulai masak");
  assert(soto.prepGuide === "ask", "prepGuide ask");

  // Walk: satu-satu → langkah bahan → lanjut → interrupt → mulai masak
  let s = fresh();
  let r = await handleSessionMessage(s, "satu-satu");
  assert(r.session.prepGuide === "walk", "satu-satu → walk");
  assert(r.prepStep?.index === 0, "bahan 0");
  assert(/Beef/i.test(r.reply), "first ingredient Beef");

  // ASR / natural walk phrases
  s = fresh();
  r = await handleSessionMessage(s, "11");
  assert(r.session.prepGuide === "walk", "11 → walk");
  assert(r.prepStep?.index === 0, "11 bahan 0");

  s = fresh();
  r = await handleSessionMessage(s, "sebut bahan satu2");
  assert(r.session.prepGuide === "walk", "sebut bahan satu2 → walk");

  r = await handleSessionMessage(r.session, "lanjut");
  assert(r.session.prepChecks.beef === true, "beef marked");
  assert(r.prepStep?.index === 1, "bahan 1");
  assert(/Salt/i.test(r.reply), "second ingredient Salt");

  r = await handleSessionMessage(r.session, "lanjut");
  assert(r.session.status === "prep", "still prep after last lanjut");
  assert(Object.values(r.session.prepChecks).every(Boolean), "all marked");
  assert(/siap masak/i.test(r.reply), "all-ready interrupt");
  assert(!r.prepStep, "no prepStep on interrupt");

  r = await handleSessionMessage(r.session, "mulai masak");
  assert(r.session.status === "cooking", "mulai masak → cooking");
  assert(r.cookStep?.index === 0, "cook step 0");

  // Free: langsung → checklist → semua siap → mulai masak
  s = fresh();
  r = await handleSessionMessage(s, "langsung");
  assert(r.session.prepGuide === "free", "langsung → free");
  assert(/Persiapan bahan/i.test(r.reply), "checklist summary");
  assert(/Beef/.test(r.reply), "shows Beef name");
  assert(!/\bbay_leaf\b/.test(r.reply), "no raw tags");

  s = fresh();
  r = await handleSessionMessage(s, "langsung aja");
  assert(r.session.prepGuide === "free", "langsung aja → free");

  // Free: re-list ingredients ID/EN; switch to walk
  r = await handleSessionMessage(
    r.session,
    "bisa ulang lagi ga sebutin bahan-bahannya",
  );
  assert(r.session.prepGuide === "free", "relist keeps free");
  assert(r.session.status === "prep", "relist still prep");
  assert(/Beef/i.test(r.reply), "relist shows Beef");
  assert(r.speak && /Beef/i.test(r.speak), "relist speak has Beef");

  r = await handleSessionMessage(r.session, "list the ingredients again");
  assert(r.session.prepGuide === "free", "EN relist keeps free");
  assert(/Salt/i.test(r.reply), "EN relist shows Salt");

  r = await handleSessionMessage(r.session, "satu-satu");
  assert(r.session.prepGuide === "walk", "free → walk via satu-satu");
  assert(r.prepStep?.index === 0, "walk starts bahan 0");

  s = fresh();
  r = await handleSessionMessage(s, "langsung");
  r = await handleSessionMessage(r.session, "semua siap");
  assert(Object.values(r.session.prepChecks).every(Boolean), "all ready");

  r = await handleSessionMessage(r.session, "Mulai masak.");
  assert(r.session.status === "cooking", "Mulai masak. → cooking");
  assert(r.cookStep?.index === 0, "step 0");

  // From ask, mulai masak skips walk
  s = fresh();
  r = await handleSessionMessage(s, "mulai memasak");
  assert(r.session.status === "cooking", "mulai memasak → cooking");

  s = fresh();
  r = await handleSessionMessage(s, "mulai masak");
  assert(r.session.status === "cooking", "mulai masak before tags");

  // Bare batal → escape confirm
  s = fresh();
  r = await handleSessionMessage(s, "batal");
  assert(r.session.pendingConfirm === "abandon_replan", "batal → confirm");
  r = await handleSessionMessage(r.session, "ya");
  assert(r.session.status === "abandoned", "batal ya → abandoned");
  assert(r.handoff, "handoff after batal");

  // Cook navigation
  s = fresh();
  r = await handleSessionMessage(s, "mulai masak");
  assert(r.session.status === "cooking", "start cook for nav");

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

  // Walk ulang / balik
  s = fresh();
  r = await handleSessionMessage(s, "satu-satu");
  r = await handleSessionMessage(r.session, "lanjut");
  r = await handleSessionMessage(r.session, "balik");
  assert(r.prepStep?.index === 0, "balik → bahan 0");
  r = await handleSessionMessage(r.session, "ulang");
  assert(r.prepStep?.index === 0, "ulang stays");

  console.log("session-message smoke OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
