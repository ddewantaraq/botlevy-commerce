/**
 * Track E demo: unpaid 402 → MockUSDC agent fee → quoted run → replay 409.
 *
 * Requires root .env:
 *   DEMO_PAYER_PRIVATE_KEY, MOCK_USDC_ADDRESS, BSC_RPC_URL
 * Server must have X402_ENABLED=true, X402_PAYTO, X402_PRICE, MOCK_USDC_ADDRESS.
 *
 * Usage (from repo root): npm run demo:x402
 * Target API: API_URL | VITE_API_URL | http://localhost:4100
 */
import { ethers } from "ethers";
import { env, MOCK_USDC_DECIMALS } from "../src/config.js";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

const API_URL = (
  process.env.API_URL ||
  process.env.VITE_API_URL ||
  "http://localhost:4100"
).replace(/\/$/, "");

const DEBUG = /^(1|true|yes|on)$/i.test(process.env.DEBUG?.trim() ?? "");

function fmtUsdc(atomic: string | number | bigint): string {
  const n = BigInt(atomic);
  const base = 10n ** BigInt(MOCK_USDC_DECIMALS);
  const whole = n / base;
  const frac = n % base;
  const fracStr = frac.toString().padStart(MOCK_USDC_DECIMALS, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr} mUSDC` : `${whole} mUSDC`;
}

const log = {
  step(n: number | string, title: string) {
    console.log(`\n${n}) ${title}`);
  },
  kv(key: string, value: unknown) {
    console.log(`   ${key}:`, value);
  },
};

type Accepts = {
  scheme?: string;
  network?: string;
  chainId?: number;
  token?: string;
  payTo?: string;
  amount?: string;
  decimals?: number;
};

type PublicRunBody = {
  ok?: boolean;
  error?: string;
  message?: string;
  accepts?: Accepts;
  runId?: string;
  status?: string;
  intent?: string;
  steps?: Array<{ tool: string; error?: string }>;
  suggestions?: Array<{ dish: string }>;
  plan?: unknown;
  quote?: {
    id?: string;
    merchantId?: string;
    merchantName?: string;
    payTo?: string;
    total?: number;
    lines?: Array<{
      name: string;
      qty: number;
      unitPrice: number;
      unit?: string;
    }>;
  };
};

async function postRun(
  body: { goal: string; pantry: string[]; selectedDish?: string },
  paymentTx?: string,
): Promise<{ status: number; json: PublicRunBody }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (paymentTx) headers["X-PAYMENT-TX"] = paymentTx;
  const res = await fetch(`${API_URL}/agent/public/runs`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as PublicRunBody;
  if (DEBUG) {
    console.log("   [DEBUG] response:", JSON.stringify(json, null, 2));
  }
  return { status: res.status, json };
}

function printQuote(quote: NonNullable<PublicRunBody["quote"]>) {
  log.kv("quoteId", quote.id);
  log.kv("merchant", `${quote.merchantName ?? "?"} (${quote.merchantId})`);
  log.kv("warung payTo", quote.payTo);
  for (const line of quote.lines ?? []) {
    const unit = line.unit ? ` ${line.unit}` : "";
    console.log(
      `   · ${line.name} × ${line.qty}${unit} @ ${fmtUsdc(line.unitPrice)}`,
    );
  }
  log.kv("total", fmtUsdc(quote.total ?? 0));
}

async function main() {
  if (!env.MOCK_USDC_ADDRESS) {
    throw new Error("Set MOCK_USDC_ADDRESS in .env");
  }
  if (!env.DEMO_PAYER_PRIVATE_KEY) {
    throw new Error("Set DEMO_PAYER_PRIVATE_KEY in .env (payer wallet)");
  }

  const key = env.DEMO_PAYER_PRIVATE_KEY.startsWith("0x")
    ? env.DEMO_PAYER_PRIVATE_KEY
    : `0x${env.DEMO_PAYER_PRIVATE_KEY}`;

  const provider = new ethers.JsonRpcProvider(env.BSC_RPC_URL, env.CHAIN_ID);
  const wallet = new ethers.Wallet(key, provider);
  const token = new ethers.Contract(env.MOCK_USDC_ADDRESS, ERC20_ABI, wallet);

  const runBody = {
    goal: "I want to cook ayam semur tonight",
    pantry: ["salt"],
  };

  log.step(0, "Banner — public x402 demo");
  log.kv("API", API_URL);
  log.kv("payer", wallet.address);
  const tBNB = await provider.getBalance(wallet.address);
  const mUsdc: bigint = await token.balanceOf(wallet.address);
  log.kv("tBNB", ethers.formatEther(tBNB));
  log.kv("mUSDC", fmtUsdc(mUsdc));

  log.step(1, "Unpaid POST → expect 402");
  const unpaid = await postRun(runBody);
  if (unpaid.status !== 402) {
    throw new Error(
      `Expected HTTP 402, got ${unpaid.status}: ${unpaid.json.error ?? unpaid.json.message}`,
    );
  }
  const accepts = unpaid.json.accepts;
  if (!accepts?.payTo || !accepts.amount) {
    throw new Error("402 response missing accepts.payTo / amount");
  }
  log.kv("HTTP", 402);
  log.kv("scheme", accepts.scheme);
  log.kv("network", accepts.network);
  log.kv("chainId", accepts.chainId);
  log.kv("token", accepts.token);
  log.kv("payTo (agent fee)", accepts.payTo);
  log.kv("amount", `${accepts.amount} atomic (= ${fmtUsdc(accepts.amount)})`);

  const fee = BigInt(accepts.amount);
  if (mUsdc < fee) {
    throw new Error(
      `Insufficient mUSDC for agent fee. Need ${fmtUsdc(fee)}, have ${fmtUsdc(mUsdc)}. Mint via Remix.`,
    );
  }

  log.step(2, "Agent fee — MockUSDC transfer (not warung payment)");
  log.kv("from", wallet.address);
  log.kv("to", accepts.payTo);
  log.kv("amount", fmtUsdc(fee));
  const tx = await token.transfer(accepts.payTo, fee);
  log.kv("txHash", tx.hash);
  log.kv("explorer", `https://testnet.bscscan.com/tx/${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error("Agent fee transfer failed on-chain");
  }
  log.kv("receipt", "ok");

  log.step(3, "Paid POST → expect quoted commerce JSON");
  const paid = await postRun(runBody, tx.hash);
  if (paid.status !== 200 || !paid.json.ok) {
    throw new Error(
      `Expected HTTP 200 quoted run, got ${paid.status}: ${paid.json.error ?? paid.json.message}`,
    );
  }
  log.kv("HTTP", paid.status);
  log.kv("runId (correlation)", paid.json.runId);
  log.kv("status", paid.json.status);
  log.kv("intent", paid.json.intent);
  log.kv(
    "steps",
    (paid.json.steps ?? []).map((s) => s.tool).join(" → "),
  );

  if (paid.json.status !== "quoted" || !paid.json.quote) {
    throw new Error(
      `Unique-value demo requires status=quoted (got ${paid.json.status}). Ensure a merchant with real payTo has matching stock.`,
    );
  }
  printQuote(paid.json.quote);

  log.step(4, "Replay same X-PAYMENT-TX → expect 409");
  const replay = await postRun(runBody, tx.hash);
  if (replay.status !== 409) {
    throw new Error(
      `Expected HTTP 409 replay, got ${replay.status}: ${replay.json.error ?? replay.json.message}`,
    );
  }
  log.kv("HTTP", 409);
  log.kv("error", replay.json.error);
  log.kv("message", replay.json.message);

  log.step("Done", "Pitch");
  console.log(
    `   Paid ${fmtUsdc(fee)} agent fee → got a warung catalog quote in JSON (not a chat recipe).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
