import type { ZodType } from "zod";

export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON object in model output");
  return JSON.parse(raw.slice(start, end + 1));
}

export function extractJsonArray(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start >= 0 && end > start) {
    return JSON.parse(raw.slice(start, end + 1));
  }
  // Some models wrap arrays in {"items":[...]}
  const obj = extractJson(text);
  if (obj && typeof obj === "object" && "items" in obj) {
    return (obj as { items: unknown }).items;
  }
  if (obj && typeof obj === "object" && "suggestions" in obj) {
    return (obj as { suggestions: unknown }).suggestions;
  }
  throw new Error("No JSON array in model output");
}

export function parseLlmJson<T>(text: string, schema: ZodType<T>): T {
  return schema.parse(extractJson(text));
}

export function parseLlmJsonArray<T>(text: string, schema: ZodType<T>): T {
  return schema.parse(extractJsonArray(text));
}
