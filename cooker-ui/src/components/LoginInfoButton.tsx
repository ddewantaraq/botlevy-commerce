type Props = {
  onClick: () => void;
  showHint?: boolean;
};

export function LoginInfoButton({ onClick, showHint = true }: Props) {
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        aria-label="Panduan login MetaMask dan BSC Testnet"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--line)] bg-white text-base text-[var(--ink)]"
      >
        ⓘ
      </button>
      {showHint ? (
        <span className="max-w-[11rem] text-right text-[10px] text-[var(--muted)]">
          Ketuk ⓘ untuk panduan login (BNB Testnet)
        </span>
      ) : null}
    </div>
  );
}
