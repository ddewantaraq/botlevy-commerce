type Props = {
  onClick: () => void;
};

/** Compact ⓘ — place next to the page title; opens login/network help. */
export function LoginInfoButton({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Panduan login MetaMask dan BSC Testnet"
      title="Panduan login (BNB Testnet)"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white text-sm leading-none text-[var(--ink)] hover:bg-[var(--canvas)]"
    >
      ⓘ
    </button>
  );
}
