import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envCandidates = [
  path.join(root, ".env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
];

const keyBeforeLoad = process.env.OLLAMA_API_KEY ?? "";
for (const envPath of envCandidates) {
  const result = loadEnv({ path: envPath });
  console.log(
    `[env] load ${envPath} → ${result.error ? `miss (${result.error.code})` : "ok"}`,
  );
}

const schema = z.object({
  PORT: z.coerce.number().default(4100),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-change-me"),
  COOKER_URL: z.string().default("http://localhost:5174"),
  MERCHANT_URL: z.string().default("http://localhost:5175"),
  CHAIN_ID: z.coerce.number().default(97),
  BSC_RPC_URL: z
    .string()
    .url()
    .default("https://data-seed-prebsc-1-s1.bnbchain.org:8545"),
  MOCK_USDC_ADDRESS: z.string().optional().default(""),
  OLLAMA_HOST: z.string().default("https://ollama.com"),
  OLLAMA_API_KEY: z.string().optional().default(""),
  OLLAMA_MODEL: z.string().default("qwen3.5"),
  DEMO_PAYER_PRIVATE_KEY: z.string().optional().default(""),
});

export const env = schema.parse(process.env);

/** Allowed browser origins for CORS (cooker + merchant UIs). */
export function uiOrigins(): string[] {
  return [...new Set([env.COOKER_URL, env.MERCHANT_URL].filter(Boolean))];
}

/** Cookie Secure flag when either UI is served over HTTPS. */
export function cookieSecure(): boolean {
  return (
    env.COOKER_URL.startsWith("https") || env.MERCHANT_URL.startsWith("https")
  );
}

/** Safe debug snapshot — never logs the full API key. */
export function debugOllamaEnv() {
  const key = env.OLLAMA_API_KEY ?? "";
  return {
    host: env.OLLAMA_HOST,
    model: env.OLLAMA_MODEL,
    keyPresent: key.length > 0,
    keyLen: key.length,
    keyPrefix: key ? `${key.slice(0, 4)}…` : "(empty)",
    keySuffix: key.length > 4 ? `…${key.slice(-4)}` : "(empty)",
    keyBeforeLoadLen: keyBeforeLoad.length,
    keyBeforeLoadDiffered:
      keyBeforeLoad.length > 0 && keyBeforeLoad !== key,
    note:
      keyBeforeLoad.length > 0 && keyBeforeLoad !== key
        ? "process env key differed from final value (dotenv does not override by default)"
        : keyBeforeLoad.length > 0 && keyBeforeLoad === key
          ? "key came from process env and/or .env (same value)"
          : "key came from .env only (or empty)",
  };
}

console.log("[env] ollama", debugOllamaEnv());

export const BSC_TESTNET_CHAIN_ID = 97;
export const MOCK_USDC_DECIMALS = 6;
