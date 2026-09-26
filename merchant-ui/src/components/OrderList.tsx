import { formatMusdc } from "@botlevy-commerce/shared";
import type { Order } from "../types/merchant";

type Props = {
  orders: Order[];
  onFulfill: (orderId: string) => void;
};

export function OrderList({ orders, onFulfill }: Props) {
  return (
    <section className="rounded-xl border border-[var(--line)] bg-white/60 p-5">
      <h2 className="text-lg font-semibold text-[#1a1a17]">Orders</h2>
      <ul className="mt-3 space-y-3">
        {orders.map((o) => (
          <li key={o.id} className="rounded-md border border-[var(--line)] p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs">{o.id}</span>
              <span className="rounded-full bg-[#e8f3ef] px-2 py-0.5 text-xs text-[var(--accent)]">
                {o.status}
              </span>
            </div>
            <p className="mt-1">{formatMusdc(o.total)} mUSDC</p>
            <p className="break-all font-mono text-xs">payer: {o.payer}</p>
            <p className="break-all font-mono text-xs">received at: {o.payTo}</p>
            <a
              className="text-xs text-[var(--accent)] underline"
              href={`https://testnet.bscscan.com/tx/${o.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              BscScan
            </a>
            {o.status === "paid" ? (
              <button
                type="button"
                onClick={() => onFulfill(o.id)}
                className="mt-2 block rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Mark fulfilled
              </button>
            ) : null}
          </li>
        ))}
        {orders.length === 0 ? (
          <li className="text-sm text-[#6f6f66]">No orders yet.</li>
        ) : null}
      </ul>
    </section>
  );
}
