import { formatMusdc, formatQtyUnit } from "@botlevy-commerce/shared";
import type { Quote } from "../types/chat";

type Props = {
  quote: Quote;
  runId?: string;
  paying: boolean;
  confirmingPay: boolean;
  signedIn: boolean;
  onPay: (quote: Quote, runId?: string) => void;
};

export function QuotePayCard({
  quote,
  runId,
  paying,
  confirmingPay,
  signedIn,
  onPay,
}: Props) {
  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-3 text-sm">
      <p className="font-semibold">{quote.merchantName}</p>
      <p>{formatMusdc(quote.total)} mUSDC</p>
      <ul className="mt-1 text-xs">
        {quote.lines.map((l) => (
          <li key={`${l.tag}-${l.name}`}>
            {l.name} × {l.qty}
            {l.unit ? ` ${l.unit}` : ""}
            {l.needQty != null && l.needUnit
              ? ` · butuh ${formatQtyUnit(l.needQty, l.needUnit)}`
              : ""}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={paying || confirmingPay || !signedIn}
        onClick={() => onPay(quote, runId)}
        className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
      >
        {paying || confirmingPay ? "Paying…" : "Pay with MockUSDC"}
      </button>
    </div>
  );
}
