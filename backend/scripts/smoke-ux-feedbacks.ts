/**
 * Smoke: UX feedbacks — bahan parse, suggest match, commerce ask_quote.
 * npx tsx scripts/smoke-ux-feedbacks.ts
 */
import { parseBahanList } from "../src/agent/tools/pantry.js";
import { toolDiffPantry } from "../src/agent/tools/pantry.js";
import { beginCommercePick, parseBahanList as parseFromFlow } from "../src/agent/dish-flow.js";
import { detectReplyLang } from "../src/agent/reply-lang.js";
import {
  clearLastSuggestions,
  clearPlanningDraft,
  getPlanningDraft,
  matchSuggestedDish,
  setLastSuggestions,
} from "../src/store.js";
import { seedIfEmpty } from "../src/seed.js";
import { hasOllamaKey } from "../src/agent/llm/client.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  seedIfEmpty();

  const bahan = parseBahanList("aku punya ayam, bawang");
  assert(bahan.includes("chicken"), `expected chicken in ${bahan.join(",")}`);
  assert(
    bahan.includes("onion") || bahan.includes("shallot"),
    `expected onion/shallot in ${bahan.join(",")}`,
  );
  assert(parseFromFlow("aku punya ayam, bawang").includes("chicken"), "re-export");

  const missing = toolDiffPantry(
    [
      { tag: "chicken", name: "Ayam", qty: 1, unit: "pcs" },
      { tag: "onion", name: "Bawang", qty: 1, unit: "pcs" },
      { tag: "salt", name: "Garam", qty: 1, unit: "tsp" },
    ],
    bahan,
  );
  assert(
    !missing.some((m) => m.tag === "chicken"),
    "chicken should not be missing",
  );
  assert(
    !missing.some((m) => m.tag === "onion"),
    "onion should not be missing",
  );
  assert(missing.some((m) => m.tag === "salt"), "salt still missing");

  assert(detectReplyLang("I want to cook chicken") === "en", "en detect");
  assert(detectReplyLang("aku mau masak ayam") === "id", "id detect");
  assert(detectReplyLang("quote") === "id", "bare quote stays id");
  assert(detectReplyLang("cek harga") === "id", "cek harga is id");

  const addr = "0xsmoke_ux_feedbacks";
  clearPlanningDraft(addr);
  clearLastSuggestions(addr);
  setLastSuggestions(addr, ["Tumis Daging Sapi", "Soto Ayam"]);
  assert(
    matchSuggestedDish(addr, "tumis daging sapi") === "Tumis Daging Sapi",
    "match suggestion",
  );

  if (!hasOllamaKey()) {
    console.log("smoke-ux-feedbacks OK (partial, no ollama for commerce pick)");
    return;
  }

  clearPlanningDraft(addr);
  const pick = await beginCommercePick({
    cookerAddress: addr,
    dish: "Soto Ayam",
    pantry: ["chicken", "salt"],
    goal: "Saya pilih Soto Ayam",
  });
  assert(
    pick.type === "ask_quote" || pick.type === "run",
    `commerce pick type ${pick.type}`,
  );
  if (pick.type === "ask_quote") {
    assert(getPlanningDraft(addr)?.phase === "ask_quote", "ask_quote draft");
    assert(pick.missing.length > 0, "has gap");
  }
  if (pick.type === "run") {
    assert(
      ["cookable", "failed"].includes(pick.run.status),
      `run status ${pick.run.status}`,
    );
  }

  console.log("smoke-ux-feedbacks OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
