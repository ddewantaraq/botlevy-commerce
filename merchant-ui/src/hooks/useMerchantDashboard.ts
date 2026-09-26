import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@botlevy-commerce/shared";
import type { Merchant, Order, Product } from "../types/merchant";
import { useMerchantAuth } from "./useMerchantAuth";
import { useMerchantCatalog } from "./useMerchantCatalog";
import { useMerchantOnboarding } from "./useMerchantOnboarding";
import { useMerchantOrders } from "./useMerchantOrders";

export function useMerchantDashboard() {
  const onboarding = useMerchantOnboarding();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [shopName, setShopName] = useState("");
  const [location, setLocation] = useState("");

  const refresh = useCallback(async () => {
    try {
      const me = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
      if (me.status === 401) {
        setMerchant(null);
        return;
      }
      if (!me.ok) {
        console.warn("[merchant] /auth/me failed:", me.status);
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
    } catch (err) {
      console.warn("[merchant] refresh error:", err);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const auth = useMerchantAuth({
    merchant,
    refresh,
    onLogoutClear: () => {
      setMerchant(null);
      setProducts([]);
      setOrders([]);
    },
  });

  const catalog = useMerchantCatalog({
    products,
    refresh,
    setError,
    setBusy,
    busy,
  });

  const orderApi = useMerchantOrders({ orders, refresh, setError });

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
          payTo: auth.address,
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

  return {
    ...onboarding,
    merchant,
    products: catalog.products,
    orders: orderApi.orders,
    error,
    busy,
    shopName,
    setShopName,
    location,
    setLocation,
    draft: catalog.draft,
    setDraft: catalog.setDraft,
    editingId: catalog.editingId,
    editDraft: catalog.editDraft,
    setEditDraft: catalog.setEditDraft,
    suggesting: catalog.suggesting,
    signedIn: auth.signedIn,
    wrongChain: auth.wrongChain,
    address: auth.address,
    walletBusy: auth.walletBusy,
    buttonLabel: auth.buttonLabel,
    walletError: auth.walletError,
    connectError: auth.connectError,
    startLogin: auth.startLogin,
    logout: auth.logout,
    switchToBsc: auth.switchToBsc,
    saveShop,
    addProduct: catalog.addProduct,
    saveEdit: catalog.saveEdit,
    removeProduct: catalog.removeProduct,
    suggestTags: catalog.suggestTags,
    fulfill: orderApi.fulfill,
    startEdit: catalog.startEdit,
    cancelEdit: catalog.cancelEdit,
  };
}
