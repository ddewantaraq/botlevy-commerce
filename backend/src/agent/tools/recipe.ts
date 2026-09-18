import { z } from "zod";
import { hasOllamaKey, ollamaChat } from "../llm/client.js";
import { extractJson } from "../llm/json.js";
import type { Plan } from "../types.js";
import { normalizeTag } from "./pantry.js";

export const RECIPE_TRY_AGAIN =
  "Maaf, gagal membuat resep. Coba chat atau bicara lagi.";

export const recipeSchema = z.object({
  dish: z.string().min(1),
  steps: z.array(z.string()).min(1),
  ingredients: z
    .array(
      z.object({
        tag: z.string().min(1),
        name: z.string().min(1),
        qty: z.number().positive(),
        unit: z.string().min(1),
      }),
    )
    .min(1),
});

export type PlanResult = z.infer<typeof recipeSchema>;

const SYSTEM_PROMPT = `You are a cooking commerce agent tool. Return ONLY a single JSON object (no markdown) with this exact shape:
{"dish":string,"steps":string[],"ingredients":[{"tag":string,"name":string,"qty":number,"unit":string}]}

Rules:
- Always include a non-empty "ingredients" array (never omit it). Use key name "ingredients" only (not "bahan").
- Each ingredient needs snake_case tag, display name, numeric qty, and unit (e.g. pcs, g, tbsp).
- "steps" must be a non-empty string array of cooking steps.
- If the user only names a dish (e.g. "soto ayam"), still invent a complete home recipe with ingredients + steps.
- Prefer Indonesian home-cooking tags like chicken, shallot, kecap_manis, garlic, onion, cooking_oil, salt, beef, potato.

Example:
{"dish":"Soto Ayam","steps":["Rebus ayam","Tumis bumbu","Sajikan"],"ingredients":[{"tag":"chicken","name":"Ayam","qty":500,"unit":"g"},{"tag":"garlic","name":"Bawang putih","qty":3,"unit":"pcs"}]}`;

/** Coerce common LLM shapes into recipeSchema input. */
export function normalizeRecipePayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = { ...(raw as Record<string, unknown>) };

  if (!Array.isArray(obj.ingredients)) {
    const alt =
      obj.ingredient ??
      obj.bahan ??
      obj.bahan_bahan ??
      obj.ingredients_list ??
      obj.items;
    if (Array.isArray(alt)) obj.ingredients = alt;
  }

  if (typeof obj.dish !== "string" && typeof obj.name === "string") {
    obj.dish = obj.name;
  }

  if (!Array.isArray(obj.steps) && Array.isArray(obj.step)) {
    obj.steps = obj.step;
  }
  if (!Array.isArray(obj.steps) && typeof obj.steps === "string") {
    obj.steps = [obj.steps];
  }

  if (Array.isArray(obj.ingredients)) {
    obj.ingredients = obj.ingredients
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const name =
          typeof r.name === "string"
            ? r.name
            : typeof r.nama === "string"
              ? r.nama
              : typeof r.item === "string"
                ? r.item
                : "";
        let tag =
          typeof r.tag === "string"
            ? r.tag
            : typeof r.id === "string"
              ? r.id
              : "";
        if (!tag && name) tag = normalizeTag(name);
        else tag = normalizeTag(tag);
        let qty = r.qty ?? r.quantity ?? r.jumlah ?? 1;
        if (typeof qty === "string") {
          const n = Number(qty.replace(",", "."));
          qty = Number.isFinite(n) && n > 0 ? n : 1;
        }
        if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
          qty = 1;
        }
        const unit =
          typeof r.unit === "string" && r.unit.trim()
            ? r.unit.trim()
            : typeof r.satuan === "string" && r.satuan.trim()
              ? r.satuan.trim()
              : "pcs";
        if (!tag || !name) return null;
        return { tag, name, qty, unit };
      })
      .filter(Boolean);
  }

  return obj;
}

function parseRecipeContent(content: string): Plan {
  const raw = extractJson(content);
  const normalized = normalizeRecipePayload(raw);
  return recipeSchema.parse(normalized);
}

async function repairRecipe(invalidSnippet: string, goal: string): Promise<Plan> {
  const content = await ollamaChat({
    label: "plan_recipe_repair",
    system: `${SYSTEM_PROMPT}

The previous JSON was invalid or incomplete. Fix it to match the schema exactly. Return ONLY the corrected JSON.`,
    user: `Goal: ${goal}\n\nBroken JSON:\n${invalidSnippet.slice(0, 2000)}`,
  });
  return parseRecipeContent(content);
}

export async function toolPlanRecipe(goal: string): Promise<{
  plan: Plan;
  source: "ollama";
}> {
  if (!hasOllamaKey()) {
    console.warn("[agent] plan_recipe: OLLAMA_API_KEY empty → fail");
    throw new Error(RECIPE_TRY_AGAIN);
  }

  let firstContent = "";
  try {
    firstContent = await ollamaChat({
      label: "plan_recipe",
      system: SYSTEM_PROMPT,
      user: goal,
    });
    const parsed = parseRecipeContent(firstContent);
    console.log("[agent] plan_recipe: ollama ok", {
      dish: parsed.dish,
      ingredientTags: parsed.ingredients.map((i) => i.tag),
    });
    return { plan: parsed, source: "ollama" };
  } catch (err) {
    console.warn("[agent] plan_recipe first pass failed, trying repair:", err);
    try {
      const snippet = firstContent || String(err);
      const repaired = await repairRecipe(snippet, goal);
      console.log("[agent] plan_recipe: repair ok", {
        dish: repaired.dish,
        ingredientTags: repaired.ingredients.map((i) => i.tag),
      });
      return { plan: repaired, source: "ollama" };
    } catch (repairErr) {
      console.warn("[agent] plan_recipe failed after repair:", repairErr);
      throw new Error(RECIPE_TRY_AGAIN);
    }
  }
}
