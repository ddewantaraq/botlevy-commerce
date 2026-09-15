import { ethers } from "ethers";
import { env, MOCK_USDC_DECIMALS } from "../config.js";

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)",
];

export type PaymentCheck = {
  ok: boolean;
  message: string;
  from?: string;
  to?: string;
  amount?: bigint;
};

/**
 * Verify a MockUSDC Transfer on BSC testnet matches expected payTo + amount.
 */
export async function verifyMockUsdcTransfer(opts: {
  txHash: string;
  expectedTo: string;
  expectedAmount: number;
  expectedFrom?: string;
}): Promise<PaymentCheck> {
  const token = env.MOCK_USDC_ADDRESS?.trim();
  if (!token) {
    return { ok: false, message: "MOCK_USDC_ADDRESS is not configured" };
  }

  const provider = new ethers.JsonRpcProvider(env.BSC_RPC_URL, env.CHAIN_ID);
  let receipt: ethers.TransactionReceipt | null;
  try {
    receipt = await provider.getTransactionReceipt(opts.txHash);
  } catch (err) {
    return {
      ok: false,
      message: `RPC error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!receipt) {
    return { ok: false, message: "Transaction not found / not mined yet" };
  }
  if (receipt.status !== 1) {
    return { ok: false, message: "Transaction failed on-chain" };
  }

  const iface = new ethers.Interface(ERC20_ABI);
  const tokenAddr = token.toLowerCase();
  const expectedTo = opts.expectedTo.toLowerCase();
  const expectedAmount = BigInt(opts.expectedAmount);

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== tokenAddr) continue;
    try {
      const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (!parsed || parsed.name !== "Transfer") continue;
      const from = String(parsed.args.from).toLowerCase();
      const to = String(parsed.args.to).toLowerCase();
      const value = BigInt(parsed.args.value);
      if (to !== expectedTo) continue;
      if (value < expectedAmount) {
        return {
          ok: false,
          message: `Transfer amount too low: got ${value}, need ${expectedAmount}`,
          from,
          to,
          amount: value,
        };
      }
      if (
        opts.expectedFrom &&
        from !== opts.expectedFrom.toLowerCase()
      ) {
        return {
          ok: false,
          message: "Transfer from unexpected payer",
          from,
          to,
          amount: value,
        };
      }
      return { ok: true, message: "Payment verified", from, to, amount: value };
    } catch {
      // not a Transfer log
    }
  }

  return {
    ok: false,
    message: `No MockUSDC Transfer to ${expectedTo} found in tx (decimals=${MOCK_USDC_DECIMALS})`,
  };
}
