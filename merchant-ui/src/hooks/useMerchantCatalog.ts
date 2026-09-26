import { useState } from "react";
import { API_URL, formatMusdc, parseMusdc } from "@botlevy-commerce/shared";
import {
  emptyProduct,
  type Product,
  type ProductDraft,
} from "../types/merchant";

type Opts = {
  products: Product[];
  refresh: () => Promise<void>;
  setError: (msg: string) => void;
  setBusy: (busy: boolean) => void;
  busy: boolean;
};

export function useMerchantCatalog({
  products,
  refresh,
  setError,
  setBusy,
  busy,
}: Opts) {
  const [draft, setDraft] = useState(emptyProduct);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState(emptyProduct);
  const [suggesting, setSuggesting] = useState<"draft" | "edit" | null>(null);

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
    if (!Number.isInteger(stock) || stock < 0) {
      throw new Error("Stock must be a whole number");
    }
    if (tags.length === 0) {
      throw new Error("Add at least one tag the agent can match");
    }

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
      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Suggest tags failed");
      }
      const tags = (data.tags as string[]).join(", ");
      if (target === "draft") setDraft((d) => ({ ...d, tags }));
      else setEditDraft((d) => ({ ...d, tags }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSuggesting(null);
    }
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

  function cancelEdit() {
    setEditingId(null);
  }

  function resetCatalogDrafts() {
    setDraft(emptyProduct);
    setEditingId(null);
    setEditDraft(emptyProduct);
    setSuggesting(null);
  }

  return {
    products,
    draft,
    setDraft,
    editingId,
    editDraft,
    setEditDraft,
    suggesting,
    busy,
    addProduct,
    saveEdit,
    removeProduct,
    suggestTags,
    startEdit,
    cancelEdit,
    resetCatalogDrafts,
  };
}

export type { ProductDraft };
