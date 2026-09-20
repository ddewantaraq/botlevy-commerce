/**
 * Golden LLM / rules eval runner.
 * Usage: npx tsx evals/run.ts
 * Requires OLLAMA_API_KEY for mode=llm and recipe-schema cases (others always run).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyIntentRules } from "../src/agent/subagents/classify-intent.js";
import { classifyIntent } from "../src/agent/subagents/classify-intent.js";
import { runPantryAgent } from "../src/agent/subagents/pantry-agent.js";
import { hasOllamaKey } from "../src/agent/llm/client.js";
import { toolPlanRecipe } from "../src/agent/tools/recipe.js";
import type { Intent, OrchestratorContext } from "../src/agent/types.js";

const root = path.dirname(fileURLToPath(import.meta.url));

type ClassifyCase = {
  id: string;
  goal: string;
  expectedIntent: Intent;
  mode: "rules" | "llm";
};

type PantryCase = {
  id: string;
  goal: string;
  chips: string[];
  expectTagsInclude: string[];
};

type RecipeCase = {
  id: string;
  goal: string;
};

function loadJson<T>(name: string): T {
  return JSON.parse(
    readFileSync(path.join(root, "fixtures", name), "utf8"),
  ) as T;
}

type Row = {
  suite: string;
  id: string;
  status: "pass" | "fail" | "skip";
  detail?: string;
};

const rows: Row[] = [];

function record(suite: string, id: string, status: Row["status"], detail?: string) {
  rows.push({ suite, id, status, detail });
  const mark = status === "pass" ? "OK" : status === "skip" ? "SKIP" : "FAIL";
  console.log(`  [${mark}] ${suite}/${id}${detail ? ` — ${detail}` : ""}`);
}

async function evalClassify() {
  console.log("\n== classify ==");
  const cases = loadJson<ClassifyCase[]>("classify.json");
  for (const c of cases) {
    if (c.mode === "rules") {
      const got = classifyIntentRules(c.goal);
      if (got === c.expectedIntent) {
        record("classify", c.id, "pass");
      } else {
        record(
          "classify",
          c.id,
          "fail",
          `expected ${c.expectedIntent}, got ${got}`,
        );
      }
      continue;
    }
    if (!hasOllamaKey()) {
      record("classify", c.id, "skip", "no OLLAMA_API_KEY");
      continue;
    }
    const ctx: OrchestratorContext = {
      goal: c.goal,
      pantry: [],
      steps: [],
    };
    // Force LLM path: clear rules by using goals that don't match rules when possible;
    // if rules match, still assert expected (fixture should be designed for LLM path).
    const fromRules = classifyIntentRules(c.goal);
    if (fromRules) {
      record(
        "classify",
        c.id,
        fromRules === c.expectedIntent ? "pass" : "fail",
        `rules short-circuit → ${fromRules}`,
      );
      continue;
    }
    const intent = await classifyIntent(ctx);
    if (intent === c.expectedIntent) {
      record("classify", c.id, "pass");
    } else {
      record(
        "classify",
        c.id,
        "fail",
        `expected ${c.expectedIntent}, got ${intent}`,
      );
    }
  }
}

async function evalPantry() {
  console.log("\n== pantry ==");
  const cases = loadJson<PantryCase[]>("pantry.json");
  for (const c of cases) {
    const ctx: OrchestratorContext = {
      goal: c.goal,
      pantry: c.chips,
      steps: [],
    };
    const tags = await runPantryAgent(ctx);
    const missing = c.expectTagsInclude.filter((t) => !tags.includes(t));
    if (missing.length === 0) {
      record("pantry", c.id, "pass", `tags=${tags.join(",")}`);
    } else {
      record(
        "pantry",
        c.id,
        "fail",
        `missing ${missing.join(",")} in [${tags.join(",")}]`,
      );
    }
  }
}

async function evalRecipeSchema() {
  console.log("\n== recipe-schema ==");
  const cases = loadJson<RecipeCase[]>("recipe-schema.json");
  if (!hasOllamaKey()) {
    for (const c of cases) {
      record("recipe-schema", c.id, "skip", "no OLLAMA_API_KEY");
    }
    return;
  }
  for (const c of cases) {
    try {
      const { plan } = await toolPlanRecipe(c.goal);
      if (
        plan.dish &&
        plan.steps.length > 0 &&
        plan.ingredients.length > 0
      ) {
        record(
          "recipe-schema",
          c.id,
          "pass",
          `dish=${plan.dish} ings=${plan.ingredients.length}`,
        );
      } else {
        record("recipe-schema", c.id, "fail", "empty dish/steps/ingredients");
      }
    } catch (err) {
      record(
        "recipe-schema",
        c.id,
        "fail",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

async function main() {
  console.log("botlevy LLM evals");
  console.log(`OLLAMA_API_KEY: ${hasOllamaKey() ? "present" : "missing"}`);

  await evalClassify();
  await evalPantry();
  await evalRecipeSchema();

  const scored = rows.filter((r) => r.status !== "skip");
  const passed = scored.filter((r) => r.status === "pass").length;
  const failed = scored.filter((r) => r.status === "fail").length;
  const skipped = rows.filter((r) => r.status === "skip").length;
  const pct = scored.length
    ? Math.round((passed / scored.length) * 100)
    : 0;

  console.log("\n== summary ==");
  console.log(
    `passed ${passed}/${scored.length} (${pct}%)  failed ${failed}  skipped ${skipped}`,
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
