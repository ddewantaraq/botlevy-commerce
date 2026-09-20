/**
 * Smoke: recipe 500 g + product kg → buy qty 1; prep label includes unit.
 * npx tsx scripts/smoke-units.ts
 */
import {
  formatIngredientLabel,
  formatQtyUnit,
  isMerchantUnit,
  normalizeUnit,
  unitsCompatible,
} from "../src/units.js";
import { toolMatchCatalog } from "../src/agent/tools/catalog.js";
import { toolCreateQuote } from "../src/agent/tools/quote.js";
import {
  clearPlanningMemory,
  newId,
  upsertMerchant,
  upsertProduct,
} from "../src/store.js";
import { buildPrepChecks } from "../src/cooker/session-message.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function main() {
  assert(normalizeUnit("gr") === "g", "gr→g");
  assert(normalizeUnit("tbsp") === "sdm", "tbsp→sdm");
  assert(normalizeUnit("tsp") === "sdt", "tsp→sdt");
  assert(normalizeUnit("liter") === "L", "liter→L");
  assert(unitsCompatible("g", "gr"), "g compatible gr");
  assert(!unitsCompatible("g", "kg"), "g not same as kg");
  assert(isMerchantUnit("kg"), "kg merchant");
  assert(!isMerchantUnit("pcs"), "pcs not merchant");
  assert(formatQtyUnit(500, "gr") === "500 g", "format 500 g");
  assert(
    formatIngredientLabel({ name: "Ayam", qty: 500, unit: "g" }) ===
      "Ayam 500 g",
    "ingredient label",
  );

  const addr = "0xsmoke_units_merchant";
  clearPlanningMemory(addr);
  const mid = newId("m");
  upsertMerchant({
    id: mid,
    name: "Smoke Warung",
    payTo: "0x2222222222222222222222222222222222222222",
    ownerAddress: addr,
    location: "test",
    updatedAt: new Date().toISOString(),
  });
  upsertProduct({
    id: newId("prod"),
    merchantId: mid,
    name: "Ayam",
    unit: "kg",
    price: 5_000_000,
    stock: 10,
    tags: ["chicken"],
  });

  const missing = [
    { tag: "chicken", name: "Ayam", qty: 500, unit: "g" },
  ];
  const match = toolMatchCatalog(missing, mid);
  assert(match.matched.length === 1, `matched got ${match.matched.length}`);
  const m = match.matched[0]!;
  assert(m.qty === 1, `buy qty should be 1 not ceil(500), got ${m.qty}`);
  assert(m.unit === "kg", `product unit kg got ${m.unit}`);
  assert(m.ingredient.qty === 500, "need qty 500");
  assert(normalizeUnit(m.ingredient.unit) === "g", "need unit g");

  const quote = toolCreateQuote({
    match,
    substitutions: [],
    merchantId: mid,
  });
  const line = quote.lines[0]!;
  assert(line.qty === 1, `quote line qty 1 got ${line.qty}`);
  assert(line.unit === "kg", `quote line unit kg got ${line.unit}`);
  assert(line.needQty === 500, `needQty 500 got ${line.needQty}`);
  assert(line.needUnit === "g", `needUnit g got ${line.needUnit}`);

  upsertProduct({
    id: newId("prod"),
    merchantId: mid,
    name: "Minyak",
    unit: "sdm",
    price: 100_000,
    stock: 50,
    tags: ["cooking_oil"],
  });
  const oilMatch = toolMatchCatalog(
    [{ tag: "cooking_oil", name: "Minyak", qty: 3, unit: "sdm" }],
    mid,
  );
  assert(oilMatch.matched[0]?.qty === 3, "same unit ceil qty 3");

  const checks = buildPrepChecks([
    { tag: "chicken" },
    { tag: "salt" },
  ]);
  assert(checks.chicken === false, "prep checks built");
  assert(
    formatIngredientLabel({
      name: "Ayam",
      qty: 500,
      unit: "g",
    }).includes("500 g"),
    "prep label includes 500 g",
  );
  assert(
    formatIngredientLabel({ name: "Garam", qty: 1, unit: "sdt" }) ===
      "Garam 1 sdt",
    "prep garam",
  );

  console.log("smoke-units OK");
}

main();
