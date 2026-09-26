import { API_URL } from "@botlevy-commerce/shared";
import type { Order } from "../types/merchant";

type Opts = {
  orders: Order[];
  refresh: () => Promise<void>;
  setError: (msg: string) => void;
};

export function useMerchantOrders({ orders, refresh, setError }: Opts) {
  async function fulfill(orderId: string) {
    setError("");
    const res = await fetch(`${API_URL}/orders/${orderId}/fulfill`, {
      method: "POST",
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.message || "Fulfill failed");
      return;
    }
    await refresh();
  }

  return { orders, fulfill };
}
