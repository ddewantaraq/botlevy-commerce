type Props = {
  shopName: string;
  location: string;
  payTo: string;
  busy: boolean;
  onShopNameChange: (value: string) => void;
  onLocationChange: (value: string) => void;
  onSave: () => void;
};

export function ShopForm({
  shopName,
  location,
  payTo,
  busy,
  onShopNameChange,
  onLocationChange,
  onSave,
}: Props) {
  return (
    <section className="space-y-3 rounded-xl border border-[var(--line)] bg-white/60 p-5">
      <h2 className="text-lg font-semibold text-[#1a1a17]">Shop</h2>
      <label className="block text-sm">
        Name
        <input
          value={shopName}
          onChange={(e) => onShopNameChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        Location
        <input
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-sm"
        />
      </label>
      <p className="break-all font-mono text-xs">payTo: {payTo}</p>
      <button
        type="button"
        disabled={busy || !shopName.trim()}
        onClick={onSave}
        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        Save shop
      </button>
    </section>
  );
}
