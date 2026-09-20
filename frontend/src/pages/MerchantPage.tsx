import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { API_URL, CHAIN_ID } from "../lib/wagmi";
import { formatMusdc, parseMusdc } from "../lib/token";
import { siweLogin, siweLogout } from "../lib/siwe";

type Product = {
  id: string;
  name: string;
  unit: string;
  price: number;
  stock: number;
  tags: string[];
};

type Order = {
  id: string;
  status: string;
  total: number;
  txHash: string;
  payer: string;
  payTo: string;
  lines: Array<{ name: string; qty: number }>;
  createdAt: string;
};

type Merchant = {
  id: string;
  name: string;
  payTo: string;
  location: string;
};

/** Measurable sell units (keep in sync with packages/commerce-shared units). */
const MERCHANT_UNITS = ["kg", "g", "ml", "L", "sdm", "sdt"] as const;

const emptyProduct = {
  name: "",
  unit: "kg" as string,
  price: "1.00",
  stock: "10",
  tags: "",
};

export function MerchantPage() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shopName, setShopName] = useState("");
  const [location, setLocation] = useState("");
  const [draft, setDraft] = useState(emptyProduct);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptyProduct);
  const [suggesting, setSuggesting] = useState<"draft" | "edit" | null>(null);

  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const signedIn =
    !!merchant &&
    !!address &&
    merchant.payTo.toLowerCase() === address.toLowerCase();

  const refresh = useCallback(async () => {
    const me = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
    if (!me.ok) {
      setMerchant(null);
      return;
    }
    const data = await me.json();
    if (data.role !== "merchant" || !data.merchant) {
      setMerchant(null);
      return;
    }
    setMerchant(data.merchant);
    setShopName(data.merchant.name ?? "");
    setLocation(data.merchant.location ?? "");
    const [prods, ords] = await Promise.all([
      fetch(`${API_URL}/merchants/me/products`, { credentials: "include" }),
      fetch(`${API_URL}/merchants/me/orders`, { credentials: "include" }),
    ]);
    if (prods.ok) {
      const p = await prods.json();
      setProducts(p.products ?? []);
    }
    if (ords.ok) {
      const o = await ords.json();
      setOrders(o.orders ?? []);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function login() {
    setBusy(true);
    setError("");
    try {
      if (wrongChain) await switchChain({ chainId: bscTestnet.id });
      if (!address) throw new Error("Connect wallet first");
      await siweLogin({
        address,
        role: "merchant",
        statement: "Sign in to Botlevy Commerce merchant dashboard",
        signMessageAsync,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await siweLogout();
    setMerchant(null);
    setProducts([]);
    setOrders([]);
    disconnect();
  }

  async function saveShop() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/merchants/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: shopName.trim(),
          location: location.trim(),
          payTo: address,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Update failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct(body: {
    id?: string;
    name: string;
    unit: string;
    price: string;
    stock: string;
    tags: string;
  }) {
    const price = parseMusdc(body.price);
    const stock = Number(body.stock);
    const tags = body.tags
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (!body.name.trim() || !body.unit.trim()) {
      throw new Error("Name and unit are required");
    }
    if (price === null) throw new Error("Price must be a mUSDC amount, e.g. 1.50");
    if (!Number.isInteger(stock) || stock < 0) throw new Error("Stock must be a whole number");
    if (tags.length === 0) throw new Error("Add at least one tag the agent can match");

    const res = await fetch(`${API_URL}/merchants/me/products`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: body.id,
        name: body.name.trim(),
        unit: body.unit.trim(),
        price,
        stock,
        tags,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || "Save product failed");
  }

  async function addProduct() {
    setBusy(true);
    setError("");
    try {
      await saveProduct(draft);
      setDraft(emptyProduct);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editingId) return;
    setBusy(true);
    setError("");
    try {
      await saveProduct({ ...editDraft, id: editingId });
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeProduct(id: string) {
    setError("");
    const res = await fetch(`${API_URL}/merchants/me/products/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.message || "Delete failed");
      return;
    }
    await refresh();
  }

  async function suggestTags(target: "draft" | "edit") {
    const name = (target === "draft" ? draft.name : editDraft.name).trim();
    if (!name) {
      setError("Enter a product name before suggesting tags");
      return;
    }
    setSuggesting(target);
    setError("");
    try {
      const res = await fetch(`${API_URL}/merchants/suggest-tags`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Suggest tags failed");
      const tags = (data.tags as string[]).join(", ");
      if (target === "draft") setDraft((d) => ({ ...d, tags }));
      else setEditDraft((d) => ({ ...d, tags }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggesting(null);
    }
  }

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

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEditDraft({
      name: p.name,
      unit: p.unit,
      price: formatMusdc(p.price),
      stock: String(p.stock),
      tags: p.tags.join(", "),
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#e7e7e0] bg-white/60 p-5">
        <h1 className="text-2xl font-semibold text-[#1a1a17]">Merchant dashboard</h1>
        <p className="mt-2 text-sm">
          SIWE on BSC Testnet (97). Your connected wallet becomes <code>payTo</code> — cooker
          payments land there.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {!isConnected ? (
            <button
              type="button"
              onClick={() => connect({ connector: connectors[0] })}
              className="rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white"
            >
              Connect merchant wallet
            </button>
          ) : (
            <>
              <span className="font-mono text-xs">{address}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-md border border-[#e7e7e0] px-3 py-1.5 text-sm"
              >
                Disconnect
              </button>
              {wrongChain ? (
                <button
                  type="button"
                  onClick={() => switchChain({ chainId: bscTestnet.id })}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  Switch to BSC Testnet
                </button>
              ) : signedIn ? (
                <span className="text-xs text-[#0f766e]">Signed in as merchant</span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void login()}
                  className="rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white"
                >
                  {busy ? "Signing…" : "SIWE login"}
                </button>
              )}
            </>
          )}
        </div>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </section>

      {merchant ? (
        <>
          <section className="rounded-xl border border-[#e7e7e0] bg-white/60 p-5 space-y-3">
            <h2 className="text-lg font-semibold text-[#1a1a17]">Shop</h2>
            <label className="block text-sm">
              Name
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              Location
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
              />
            </label>
            <p className="font-mono text-xs break-all">payTo: {merchant.payTo}</p>
            <button
              type="button"
              disabled={busy || !shopName.trim()}
              onClick={() => void saveShop()}
              className="rounded-md bg-[#0f766e] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save shop
            </button>
          </section>

          <section className="rounded-xl border border-[#e7e7e0] bg-white/60 p-5 space-y-3">
            <h2 className="text-lg font-semibold text-[#1a1a17]">Add product</h2>
            <p className="text-xs text-[#6f6f66]">
              Tags are what the agent matches (e.g. chicken, shallot, kecap_manis). Price is mUSDC.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                placeholder="Name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
              />
              <select
                value={draft.unit}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                className="rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
                aria-label="Unit"
              >
                {MERCHANT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <input
                placeholder="Price (mUSDC)"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                className="rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
              />
              <input
                placeholder="Stock"
                value={draft.stock}
                onChange={(e) => setDraft({ ...draft, stock: e.target.value })}
                className="rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
              />
              <input
                placeholder="Tags, comma-separated"
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                className="sm:col-span-2 rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || suggesting === "draft" || !draft.name.trim()}
                onClick={() => void suggestTags("draft")}
                className="rounded-md border border-[#e7e7e0] px-3 py-1.5 text-sm disabled:opacity-60"
              >
                {suggesting === "draft" ? "Suggesting…" : "Suggest tags"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void addProduct()}
                className="rounded-md bg-[#0f766e] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                Add to catalog
              </button>
            </div>
          </section>

          <section className="rounded-xl border border-[#e7e7e0] bg-white/60 p-5">
            <h2 className="text-lg font-semibold text-[#1a1a17]">Catalog</h2>
            <ul className="mt-3 space-y-3 text-sm">
              {products.map((p) => (
                <li key={p.id} className="border-b border-[#e7e7e0] py-3">
                  {editingId === p.id ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        className="rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
                      />
                      <select
                        value={
                          (MERCHANT_UNITS as readonly string[]).includes(
                            editDraft.unit,
                          )
                            ? editDraft.unit
                            : "kg"
                        }
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, unit: e.target.value })
                        }
                        className="rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
                        aria-label="Unit"
                      >
                        {MERCHANT_UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      <input
                        value={editDraft.price}
                        onChange={(e) => setEditDraft({ ...editDraft, price: e.target.value })}
                        className="rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
                      />
                      <input
                        value={editDraft.stock}
                        onChange={(e) => setEditDraft({ ...editDraft, stock: e.target.value })}
                        className="rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
                      />
                      <input
                        value={editDraft.tags}
                        onChange={(e) => setEditDraft({ ...editDraft, tags: e.target.value })}
                        className="sm:col-span-2 rounded-md border border-[#e7e7e0] bg-transparent px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy || suggesting === "edit"}
                          onClick={() => void suggestTags("edit")}
                          className="rounded-md border border-[#e7e7e0] px-3 py-1.5 text-xs disabled:opacity-60"
                        >
                          {suggesting === "edit" ? "Suggesting…" : "Suggest tags"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveEdit()}
                          className="rounded-md bg-[#0f766e] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded-md border border-[#e7e7e0] px-3 py-1.5 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p>
                          {p.name}{" "}
                          <span className="text-xs text-[#6f6f66]">
                            [{p.tags.join(", ")}] stock={p.stock} {p.unit}
                          </span>
                        </p>
                        <p className="font-mono text-xs">{formatMusdc(p.price)} mUSDC</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(p)}
                          className="rounded-md border border-[#e7e7e0] px-3 py-1.5 text-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeProduct(p.id)}
                          className="rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {products.length === 0 ? (
                <li className="text-[#6f6f66]">No products yet. Add items the agent can match.</li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-xl border border-[#e7e7e0] bg-white/60 p-5">
            <h2 className="text-lg font-semibold text-[#1a1a17]">Orders</h2>
            <ul className="mt-3 space-y-3">
              {orders.map((o) => (
                <li key={o.id} className="rounded-md border border-[#e7e7e0] p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs">{o.id}</span>
                    <span className="rounded-full bg-[#e8f3ef] px-2 py-0.5 text-xs text-[#0f766e]">
                      {o.status}
                    </span>
                  </div>
                  <p className="mt-1">{formatMusdc(o.total)} mUSDC</p>
                  <p className="font-mono text-xs break-all">payer: {o.payer}</p>
                  <p className="font-mono text-xs break-all">received at: {o.payTo}</p>
                  <a
                    className="text-xs text-[#0f766e] underline"
                    href={`https://testnet.bscscan.com/tx/${o.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    BscScan
                  </a>
                  {o.status === "paid" ? (
                    <button
                      type="button"
                      onClick={() => void fulfill(o.id)}
                      className="mt-2 block rounded-md bg-[#0f766e] px-3 py-1.5 text-xs font-semibold text-white"
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
        </>
      ) : null}
    </div>
  );
}
