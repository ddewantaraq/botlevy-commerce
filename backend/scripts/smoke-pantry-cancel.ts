/**
 * Smoke: pantry carry after suggestions + batal/menu baru reset.
 * npx tsx scripts/smoke-pantry-cancel.ts
 */
import {
  parseBahanList,
  toolDiffPantry,
  normalizePantryTags,
} from "../src/agent/tools/pantry.js";
import { beginCommercePick } from "../src/agent/dish-flow.js";
import {
  handlePlanningResetTurn,
  isPlanningEscape,
} from "../src/agent/planning-reset.js";
import {
  clearPlanningMemory,
  getLastPlanningPantry,
  getLastSuggestions,
  getPlanningDraft,
  hasPendingReset,
  setLastPlanningPantry,
  setLastSuggestions,
  setPlanningDraft,
} from "../src/store.js";
import { seedIfEmpty } from "../src/seed.js";
import { hasOllamaKey } from "../src/agent/llm/client.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  seedIfEmpty();

  // parse: daging sapi sama bawang
  const parsed = parseBahanList("ada bahan daging sapi sama bawang");
  assert(parsed.includes("beef"), `expected beef in ${parsed.join(",")}`);
  assert(
    parsed.includes("onion") || parsed.includes("shallot"),
    `expected onion/shallot in ${parsed.join(",")}`,
  );

  // diff: recipe tag sapi / daging_sapi with pantry beef
  const missingSapi = toolDiffPantry(
    [
      { tag: "sapi", name: "Daging sapi", qty: 200, unit: "g" },
      { tag: "onion", name: "Bawang", qty: 1, unit: "pcs" },
      { tag: "salt", name: "Garam", qty: 1, unit: "tsp" },
    ],
    ["beef", "onion"],
  );
  assert(
    !missingSapi.some((m) => m.tag === "sapi"),
    "sapi must not be missing when pantry has beef",
  );
  assert(
    !missingSapi.some((m) => m.tag === "onion"),
    "onion must not be missing",
  );
  assert(missingSapi.some((m) => m.tag === "salt"), "salt still missing");

  const missingReverse = toolDiffPantry(
    [{ tag: "daging_sapi", name: "Daging", qty: 1, unit: "pcs" }],
    ["beef"],
  );
  assert(
    missingReverse.length === 0,
    "daging_sapi covered by beef via reverse alias",
  );

  const addr = "0xsmoke_pantry_cancel";
  clearPlanningMemory(addr);

  // Simulate suggestions run pantry carry → pick with empty chips
  setLastPlanningPantry(addr, ["beef", "onion"]);
  setLastSuggestions(addr, ["Sapi Bawang Goreng"]);
  assert(
    getLastPlanningPantry(addr).includes("beef"),
    "lastPlanningPantry persisted",
  );

  const merged = normalizePantryTags([
    ...[],
    ...getLastPlanningPantry(addr),
  ]);
  assert(merged.includes("beef"), "merge empty chips + carried pantry");

  const missingAfterCarry = toolDiffPantry(
    [
      { tag: "beef", name: "Sapi", qty: 200, unit: "g" },
      { tag: "onion", name: "Bawang", qty: 2, unit: "pcs" },
      { tag: "garlic", name: "Bawang putih", qty: 3, unit: "clove" },
    ],
    merged,
  );
  assert(
    !missingAfterCarry.some((m) => m.tag === "beef" || m.tag === "sapi"),
    "beef/sapi not missing after pantry carry",
  );

  if (hasOllamaKey()) {
    const pick = await beginCommercePick({
      cookerAddress: addr,
      dish: "Sapi Bawang Goreng",
      pantry: [],
      goal: "sapi bawang goreng",
    });
    if (pick.type === "ask_quote" || pick.type === "confirm_gap") {
      assert(
        !pick.missing.some(
          (m) =>
            m.tag === "beef" ||
            m.tag === "sapi" ||
            m.tag === "daging_sapi" ||
            m.tag === "onion" ||
            m.tag === "shallot",
        ),
        `pick missing should not include beef/onion: ${pick.missing.map((m) => m.tag).join(",")}`,
      );
      assert(
        pick.userBahan.includes("beef"),
        `userBahan should carry beef: ${pick.userBahan.join(",")}`,
      );
    } else if (pick.type === "run") {
      assert(
        pick.run.pantry.includes("beef"),
        "run pantry should include carried beef",
      );
    }
  }

  // Reset: mid draft → batal → yakin → clear
  clearPlanningMemory(addr);
  setLastSuggestions(addr, ["Soto Ayam"]);
  setPlanningDraft({
    cookerAddress: addr,
    dish: "Soto Ayam",
    phase: "ask_quote",
    userBahan: ["chicken"],
    plan: {
      dish: "Soto Ayam",
      servings: 2,
      ingredients: [{ tag: "chicken", name: "Ayam", qty: 1, unit: "pcs" }],
      steps: ["Rebus"],
    },
    missing: [{ tag: "salt", name: "Garam", qty: 1, unit: "tsp" }],
    updatedAt: new Date().toISOString(),
  });

  assert(isPlanningEscape("batal"), "batal is escape");
  assert(isPlanningEscape("menu baru"), "menu baru is escape");
  assert(isPlanningEscape("ganti menu"), "ganti menu is escape");

  const ask = await handlePlanningResetTurn(addr, "batal");
  assert(ask?.status === "ask_reset", `expected ask_reset got ${ask?.status}`);
  assert(hasPendingReset(addr), "pending reset set");
  assert(getPlanningDraft(addr), "draft still until confirm");

  const yes = await handlePlanningResetTurn(addr, "ya");
  assert(yes?.status === "reset_done", `expected reset_done got ${yes?.status}`);
  assert(!getPlanningDraft(addr), "draft cleared");
  assert(getLastSuggestions(addr).length === 0, "suggestions cleared");
  assert(getLastPlanningPantry(addr).length === 0, "pantry cleared");
  assert(!hasPendingReset(addr), "pending cleared");

  // Idle escape → immediate
  const idle = await handlePlanningResetTurn(addr, "menu baru");
  assert(idle?.status === "reset_idle", `expected reset_idle got ${idle?.status}`);
  assert(/mau masak apa/i.test(idle!.message), "idle copy");

  console.log("smoke-pantry-cancel OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
