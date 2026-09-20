import { z } from "zod";
import { hasOllamaKey, ollamaChat } from "../llm/client.js";
import { parseLlmJson } from "../llm/json.js";
import { normalizeTag } from "../tools/pantry.js";

const tagsSchema = z.object({
  tags: z.array(z.string()).min(1).max(8),
});

function heuristicTags(name: string): string[] {
  const n = name.toLowerCase();
  const tags: string[] = [];
  const map: Array<[RegExp, string]> = [
    [/\b(daging\s+sapi|beef)\b/, "beef"],
    [/\b(ayam|chicken)\b/, "chicken"],
    [/\b(bawang\s+putih|garlic)\b/, "garlic"],
    [/\b(bawang\s+merah|shallot)\b/, "shallot"],
    [/\b(bawang|onion)\b/, "onion"],
    [/\b(kentang|potato)\b/, "potato"],
    [/\b(kecap)\b/, "kecap_manis"],
    [/\b(garam|salt)\b/, "salt"],
    [/\b(minyak|oil)\b/, "cooking_oil"],
    [/\b(mentega|butter)\b/, "butter"],
    [/\b(lada|pepper)\b/, "pepper"],
    [/\b(pala|nutmeg)\b/, "nutmeg"],
  ];
  for (const [re, tag] of map) {
    if (re.test(n)) tags.push(tag);
  }
  if (tags.length === 0) {
    const slug = normalizeTag(name);
    if (slug) tags.push(slug.split("_").slice(0, 3).join("_") || slug);
  }
  return [...new Set(tags)].slice(0, 5);
}

/**
 * Suggest catalog tags from a product name for merchant add/edit.
 * Not part of the cooker orchestrator state machine.
 */
export async function suggestProductTags(opts: {
  name: string;
  notes?: string;
}): Promise<{ tags: string[]; source: "ollama" | "fallback" }> {
  const name = opts.name.trim();
  if (!name) return { tags: [], source: "fallback" };

  if (hasOllamaKey()) {
    try {
      const { content } = await ollamaChat({
        label: "catalog_assist",
        system: `Suggest snake_case ingredient tags for a warung product so a cooking agent can match them. Return ONLY JSON:
{"tags":["tag1","tag2"]}
Prefer common English snake_case (beef, chicken, shallot, kecap_manis). 1-5 tags.`,
        user: `Product name: ${name}${opts.notes ? `\nNotes: ${opts.notes}` : ""}`,
      });
      const tags = parseLlmJson(content, tagsSchema).tags
        .map(normalizeTag)
        .filter(Boolean);
      if (tags.length > 0) return { tags: [...new Set(tags)], source: "ollama" };
    } catch (err) {
      console.warn("[agent] catalog_assist fallback:", err);
    }
  }

  return { tags: heuristicTags(name), source: "fallback" };
}
