/**
 * Smoke: quoted→belanja idle; mau quotes; mager off_topic.
 * npx tsx scripts/smoke-quote-flip.ts
 */
import {
  abandonQuotedForSelfBuy,
  isWantQuoteExplicit,
  isSkipQuote,
  softNormalizeQuoteWords,
} from "../src/agent/dish-flow.js";
import { gatePlanningRequest } from "../src/agent/planning-gate.js";
import {
  clearPlanningMemory,
  getLastReadyRunId,
  getPlanningDraft,
  markReadyForPrep,
  newId,
  saveRun,
  setLastReadyRun,
} from "../src/store.js";
import { seedIfEmpty } from "../src/seed.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  seedIfEmpty();
  const addr = "0xsmoke_quote_flip";
  clearPlanningMemory(addr);

  // ASR / detector: quotes plural
  assert(
    softNormalizeQuoteWords("mau quotes") === "mau quote",
    "softNormalize quotes→quote",
  );
  assert(isWantQuoteExplicit("mau quotes"), "detector accepts mau quotes");
  assert(isWantQuoteExplicit("mau quote"), "detector accepts mau quote");
  assert(isWantQuoteExplicit("cek harga"), "detector accepts cek harga");
  assert(isWantQuoteExplicit("mau cek harga"), "detector accepts mau cek harga");
  assert(isWantQuoteExplicit("harga warung"), "detector accepts harga warung");
  assert(isSkipQuote("belanja sendiri"), "skip quote");

  // Quoted → belanja sendiri → idle same dish
  const plan = {
    dish: "Soto Ayam",
    steps: ["Rebus", "Sajikan"],
    ingredients: [
      { tag: "chicken", name: "Ayam", qty: 1, unit: "pcs" },
      { tag: "salt", name: "Garam", qty: 1, unit: "tsp" },
    ],
  };
  const missing = [{ tag: "salt", name: "Garam", qty: 1, unit: "tsp" }];
  const runId = newId("run");
  saveRun({
    id: runId,
    goal: "mau quote",
    pantry: ["chicken"],
    steps: [],
    intent: "known_dish",
    status: "quoted",
    selectedDish: "Soto Ayam",
    plan,
    missing,
    createdAt: new Date().toISOString(),
  });
  markReadyForPrep(addr, runId);
  assert(getLastReadyRunId(addr) === runId, "ready quoted");

  const abandoned = abandonQuotedForSelfBuy(addr, "belanja sendiri");
  assert(abandoned?.type === "idle", `expected idle got ${abandoned?.type}`);
  if (abandoned?.type !== "idle") throw new Error("not idle");
  assert(abandoned.dish === "Soto Ayam", "same dish Soto Ayam");
  assert(!/nasi goreng/i.test(abandoned.message), "no nasi goreng");
  assert(getPlanningDraft(addr)?.phase === "idle", "idle draft restored");
  assert(
    getPlanningDraft(addr)?.dish === "Soto Ayam",
    "draft dish Soto Ayam",
  );
  assert(getLastReadyRunId(addr) === null, "quoted ready cleared");

  // no_merchant → belanja sendiri recovery (no draft, lastReady = no_merchant)
  clearPlanningMemory(addr);
  const nmId = newId("run");
  saveRun({
    id: nmId,
    goal: "ya",
    pantry: ["chicken"],
    steps: [],
    intent: "known_dish",
    status: "no_merchant",
    selectedDish: "Soto Ayam",
    plan,
    missing,
    createdAt: new Date().toISOString(),
  });
  // setLastReadyRun only — do not arm prep pending
  setLastReadyRun(addr, nmId);
  assert(getLastReadyRunId(addr) === nmId, "ready no_merchant");
  assert(!getPlanningDraft(addr), "no draft after no_merchant wipe");

  const fromNm = abandonQuotedForSelfBuy(addr, "belanja sendiri");
  assert(fromNm?.type === "idle", `no_merchant belanja → idle got ${fromNm?.type}`);
  if (fromNm?.type !== "idle") throw new Error("not idle");
  assert(fromNm.dish === "Soto Ayam", "no_merchant recovery same dish");
  assert(getPlanningDraft(addr)?.phase === "idle", "idle draft from no_merchant");
  assert(getLastReadyRunId(addr) === null, "no_merchant ready cleared");

  // Off-topic: mager / magerrr
  const g1 = await gatePlanningRequest("mager");
  assert(g1.kind === "off_topic", `mager → off_topic got ${g1.kind}`);
  const g2 = await gatePlanningRequest("magerrr");
  assert(g2.kind === "off_topic", `magerrr → off_topic got ${g2.kind}`);
  const g3 = await gatePlanningRequest("magerrrrr");
  assert(g3.kind === "off_topic", `magerrrrr → off_topic got ${g3.kind}`);
  assert(
    !/Magerr/i.test(g2.reply || ""),
    "reply must not invent Magerr dish",
  );

  // Still allows real dishes through rules (null → may LLM; at least not forced off_topic for soto)
  const gDish = await gatePlanningRequest("soto ayam");
  assert(
    gDish.kind === "cooking_request",
    `soto ayam should be cooking_request got ${gDish.kind}`,
  );

  console.log("smoke-quote-flip OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
