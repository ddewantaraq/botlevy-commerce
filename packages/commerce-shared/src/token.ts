export const MOCK_USDC_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export function formatMusdc(amount: number) {
  return (amount / 1_000_000).toFixed(2);
}

/** Human mUSDC (e.g. "1.25") → 6-decimal base units. */
export function parseMusdc(input: string): number | null {
  const n = Number(input.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1_000_000);
}
