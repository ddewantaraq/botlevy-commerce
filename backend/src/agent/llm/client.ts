import { Ollama } from "ollama";
import { env } from "../../config.js";

export function hasOllamaKey(): boolean {
  return Boolean(env.OLLAMA_API_KEY);
}

export function ollamaClient() {
  const headers: Record<string, string> = {};
  if (env.OLLAMA_API_KEY) {
    headers.Authorization = `Bearer ${env.OLLAMA_API_KEY}`;
  }
  return new Ollama({ host: env.OLLAMA_HOST, headers });
}

export async function ollamaChat(opts: {
  system: string;
  user: string;
  temperature?: number;
  label?: string;
}): Promise<string> {
  if (!env.OLLAMA_API_KEY) {
    throw new Error("OLLAMA_API_KEY empty");
  }
  const label = opts.label ?? "ollama";
  console.log(`[agent] ${label}: calling ollama`, {
    host: env.OLLAMA_HOST,
    model: env.OLLAMA_MODEL,
    keyLen: env.OLLAMA_API_KEY.length,
    keyPrefix: `${env.OLLAMA_API_KEY.slice(0, 4)}…`,
  });
  const client = ollamaClient();
  const response = await client.chat({
    model: env.OLLAMA_MODEL,
    stream: false,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    options: { temperature: opts.temperature ?? 0 },
  });
  return response.message?.content ?? "";
}
