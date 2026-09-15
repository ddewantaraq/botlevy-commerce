/**
 * Scripted agent demo: run CommerceAgent → pay MockUSDC → create order.
 *
 * Requires root .env:
 *   MOCK_USDC_ADDRESS, BSC_RPC_URL, DEMO_PAYER_PRIVATE_KEY
 * Optional: OLLAMA_API_KEY (else ayam-semur fallback plan)
 *
 * Usage (from repo root): npm run demo:agent
 */
import { ethers } from "ethers";
import { env } from "../src/config.js";
import { seedIfEmpty } from "../src/seed.js";
import { runCommerceAgent } from "../src/agent/run.js";
import { getMerchant, isRealPayTo, listOrders, newId, saveOrder, upsertMerchant } from "../src/store.js";
import { verifyMockUsdcTransfer } from "../src/payments/verify.js";

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  seedIfEmpty();

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
  console.log("1) Dedicated payer:", wallet.address);

  // Scripted path only: seed shops start on a placeholder payTo. Point the seed
  // warung at this dedicated account so catalog matching still produces a quote.
  const seed = getMerchant("m_warung_sehat");
  if (seed && !isRealPayTo(seed.payTo)) {
    upsertMerchant({
      ...seed,
      payTo: wallet.address.toLowerCase(),
      updatedAt: new Date().toISOString(),
    });
    console.log("   seed payTo set to dedicated account:", wallet.address);
  }

  console.log("2) Running CommerceAgent…");
  const run = await runCommerceAgent({
    goal: "I want to cook ayam semur tonight",
    pantry: ["salt"],
  });
  console.log("   runId:", run.id);
  console.log(
    "   steps:",
    run.steps.map((s) => s.tool).join(" → "),
  );
  if (!run.quote) throw new Error("Agent did not produce a quote");
  console.log("   quote:", run.quote.id, "total=", run.quote.total);

  const merchant = getMerchant(run.quote.merchantId);
  console.log("   merchant payTo:", merchant?.payTo);

  const token = new ethers.Contract(env.MOCK_USDC_ADDRESS, ERC20_ABI, wallet);
  const bal: bigint = await token.balanceOf(wallet.address);
  console.log("   mUSDC balance:", bal.toString());
  if (bal < BigInt(run.quote.total)) {
    throw new Error(
      `Insufficient mUSDC. Need ${run.quote.total}, have ${bal}. Mint via Remix.`,
    );
  }

  console.log("3) Sending MockUSDC transfer…");
  const tx = await token.transfer(run.quote.payTo, BigInt(run.quote.total));
  console.log("   txHash:", tx.hash);
  await tx.wait();

  console.log("4) Verifying + creating order…");
  const check = await verifyMockUsdcTransfer({
    txHash: tx.hash,
    expectedTo: run.quote.payTo,
    expectedAmount: run.quote.total,
    expectedFrom: wallet.address,
  });
  if (!check.ok) throw new Error(check.message);

  const order = saveOrder({
    id: newId("ord"),
    merchantId: run.quote.merchantId,
    payer: wallet.address.toLowerCase(),
    payTo: run.quote.payTo,
    total: run.quote.total,
    txHash: tx.hash,
    status: "paid",
    lines: run.quote.lines,
    createdAt: new Date().toISOString(),
  });

  console.log("5) Done.");
  console.log("   orderId:", order.id);
  console.log("   explorer:", `https://testnet.bscscan.com/tx/${order.txHash}`);
  console.log("   merchant orders now:", listOrders(order.merchantId).length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
