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

export type LlmTraceMeta = {
  label: string;
  model: string;
  system: string;
  user: string;
  raw: string;
  ms: number;
  at: string;
};

/** Persisted on AgentStep when LLM_TRACE is on. */
export type LlmStepPayload = {
  label: string;
  model: string;
  system?: string;
  user: string;
  raw: string;
  ms: number;
  parseOk?: boolean;
};

export type OllamaChatResult = {
  content: string;
  meta: LlmTraceMeta;
};

const TRACE_MAX = 4000;

function truncate(s: string): { text: string; truncated: boolean } {
  if (s.length <= TRACE_MAX) return { text: s, truncated: false };
  return { text: s.slice(0, TRACE_MAX), truncated: true };
}

/** Attach to AgentStep only when LLM_TRACE is enabled. */
export function toStepLlm(
  meta: LlmTraceMeta,
  parseOk?: boolean,
): LlmStepPayload | undefined {
  if (!env.LLM_TRACE) return undefined;
  return {
    label: meta.label,
    model: meta.model,
    system: meta.system,
    user: meta.user,
    raw: meta.raw,
    ms: meta.ms,
    parseOk,
  };
}

function emitTrace(meta: LlmTraceMeta): void {
  if (!env.LLM_TRACE) return;
  const system = truncate(meta.system);
  const user = truncate(meta.user);
  const raw = truncate(meta.raw);
  console.log(
    "[llm_trace]",
    JSON.stringify({
      label: meta.label,
      model: meta.model,
      ms: meta.ms,
      at: meta.at,
      system: system.text,
      user: user.text,
      raw: raw.text,
      truncated: system.truncated || user.truncated || raw.truncated,
    }),
  );
}

export async function ollamaChat(opts: {
  system: string;
  user: string;
  temperature?: number;
  label?: string;
}): Promise<OllamaChatResult> {
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
  const started = Date.now();
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
  const content = response.message?.content ?? "";
  const meta: LlmTraceMeta = {
    label,
    model: env.OLLAMA_MODEL,
    system: opts.system,
    user: opts.user,
    raw: content,
    ms: Date.now() - started,
    at: new Date().toISOString(),
  };
  emitTrace(meta);
  return { content, meta };
}
