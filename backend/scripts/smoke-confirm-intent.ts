/**
 * Smoke: ASR-friendly ya/tidak + classifyConfirmRules.
 * npx tsx scripts/smoke-confirm-intent.ts
 */
import {
  classifyConfirmRules,
  isAffirmative,
  isNegative,
} from "../src/cooker/confirm-intent.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function main() {
  assert(isAffirmative("Ya."), "Ya.");
  assert(isAffirmative("iyaa"), "iyaa");
  assert(isAffirmative("iya dong"), "iya dong");
  assert(isAffirmative("OK"), "OK");
  assert(classifyConfirmRules("Ya.") === "yes", "rules Ya.");
  assert(classifyConfirmRules("iyaa") === "yes", "rules iyaa");

  assert(isNegative("tidak."), "tidak.");
  assert(isNegative("nggak"), "nggak");
  assert(isNegative("enggak"), "enggak");
  assert(classifyConfirmRules("tidak.") === "no", "rules tidak.");
  assert(classifyConfirmRules("nggak") === "no", "rules nggak");

  assert(classifyConfirmRules("asdf qwerty") === "unclear", "nonsense unclear");
  assert(!isAffirmative("ayam bawang"), "bahan not yes");

  console.log("smoke-confirm-intent OK");
}

main();
