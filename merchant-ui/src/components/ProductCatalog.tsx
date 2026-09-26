import { formatMusdc, MERCHANT_UNITS } from "@botlevy-commerce/shared";
import type { Product, ProductDraft } from "../types/merchant";

type Props = {
  draft: ProductDraft;
  products: Product[];
  editingId: string | null;
  editDraft: ProductDraft;
  busy: boolean;
  suggesting: "draft" | "edit" | null;
  onDraftChange: (draft: ProductDraft) => void;
  onEditDraftChange: (draft: ProductDraft) => void;
  onSuggestTags: (target: "draft" | "edit") => void;
  onAddProduct: () => void;
  onStartEdit: (product: Product) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRemoveProduct: (id: string) => void;
};

export function ProductCatalog({
  draft,
  products,
  editingId,
  editDraft,
  busy,
  suggesting,
  onDraftChange,
  onEditDraftChange,
  onSuggestTags,
  onAddProduct,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRemoveProduct,
}: Props) {
  return (
    <>
      <section className="space-y-3 rounded-xl border border-[var(--line)] bg-white/60 p-5">
        <h2 className="text-lg font-semibold text-[#1a1a17]">Add product</h2>
        <p className="text-xs text-[#6f6f66]">
          Tags are what the agent matches (e.g. chicken, shallot, kecap_manis). Price
          is mUSDC.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            placeholder="Name"
            value={draft.name}
            onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
            className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
          <select
            value={draft.unit}
            onChange={(e) => onDraftChange({ ...draft, unit: e.target.value })}
            className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
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
            onChange={(e) => onDraftChange({ ...draft, price: e.target.value })}
            className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
          <input
            placeholder="Stock"
            value={draft.stock}
            onChange={(e) => onDraftChange({ ...draft, stock: e.target.value })}
            className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
          />
          <input
            placeholder="Tags, comma-separated"
            value={draft.tags}
            onChange={(e) => onDraftChange({ ...draft, tags: e.target.value })}
            className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm sm:col-span-2"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || suggesting === "draft" || !draft.name.trim()}
            onClick={() => onSuggestTags("draft")}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {suggesting === "draft" ? "Suggesting…" : "Suggest tags"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAddProduct}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            Add to catalog
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--line)] bg-white/60 p-5">
        <h2 className="text-lg font-semibold text-[#1a1a17]">Catalog</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {products.map((p) => (
            <li key={p.id} className="border-b border-[var(--line)] py-3">
              {editingId === p.id ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    value={editDraft.name}
                    onChange={(e) =>
                      onEditDraftChange({ ...editDraft, name: e.target.value })
                    }
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                  />
                  <select
                    value={
                      (MERCHANT_UNITS as readonly string[]).includes(editDraft.unit)
                        ? editDraft.unit
                        : "kg"
                    }
                    onChange={(e) =>
                      onEditDraftChange({ ...editDraft, unit: e.target.value })
                    }
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
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
                    onChange={(e) =>
                      onEditDraftChange({ ...editDraft, price: e.target.value })
                    }
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                  />
                  <input
                    value={editDraft.stock}
                    onChange={(e) =>
                      onEditDraftChange({ ...editDraft, stock: e.target.value })
                    }
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
                  />
                  <input
                    value={editDraft.tags}
                    onChange={(e) =>
                      onEditDraftChange({ ...editDraft, tags: e.target.value })
                    }
                    className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm sm:col-span-2"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy || suggesting === "edit"}
                      onClick={() => onSuggestTags("edit")}
                      className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs disabled:opacity-60"
                    >
                      {suggesting === "edit" ? "Suggesting…" : "Suggest tags"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onSaveEdit}
                      className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={onCancelEdit}
                      className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs"
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
                    <p className="font-mono text-xs">
                      {formatMusdc(p.price)} mUSDC
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => onStartEdit(p)}
                      className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveProduct(p.id)}
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
            <li className="text-[#6f6f66]">
              No products yet. Add items the agent can match.
            </li>
          ) : null}
        </ul>
      </section>
    </>
  );
}
