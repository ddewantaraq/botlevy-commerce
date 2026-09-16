import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireMerchant } from "../middleware/auth.js";
import {
  deleteProduct,
  findMerchantByOwner,
  getMerchant,
  listMerchants,
  listOrders,
  listProducts,
  newId,
  isRealPayTo,
  upsertMerchant,
  upsertProduct,
} from "../store.js";
import { suggestProductTags } from "../agent/subagents/catalog-assist.js";

export const merchantsRouter = Router();

merchantsRouter.get("/", (_req, res) => {
  res.json({
    ok: true,
    merchants: listMerchants().map((m) => ({
      ...m,
      productCount: listProducts(m.id).length,
    })),
  });
});

const profileSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  location: z.string().max(120).optional(),
  payTo: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

merchantsRouter.patch(
  "/me",
  requireMerchant,
  (req: AuthedRequest, res) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, errors: parsed.error.flatten() });
      return;
    }
    const existing = findMerchantByOwner(req.merchantAddress!);
    if (!existing) {
      res.status(404).json({ ok: false, message: "Merchant profile missing" });
      return;
    }
    const payTo = (parsed.data.payTo ?? existing.payTo).toLowerCase();
    if (!isRealPayTo(payTo)) {
      res.status(400).json({ ok: false, message: "payTo must be a real wallet address" });
      return;
    }
    const updated = upsertMerchant({
      ...existing,
      name: parsed.data.name ?? existing.name,
      location: parsed.data.location ?? existing.location,
      payTo,
      updatedAt: new Date().toISOString(),
    });
    res.json({ ok: true, merchant: updated });
  },
);

const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  unit: z.string().min(1),
  price: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  tags: z.array(z.string()).min(1),
});

merchantsRouter.get(
  "/me/products",
  requireMerchant,
  (req: AuthedRequest, res) => {
    const merchant = findMerchantByOwner(req.merchantAddress!);
    if (!merchant) {
      res.status(404).json({ ok: false, message: "Merchant profile missing" });
      return;
    }
    res.json({ ok: true, products: listProducts(merchant.id) });
  },
);

merchantsRouter.get(
  "/me/orders",
  requireMerchant,
  (req: AuthedRequest, res) => {
    const merchant = findMerchantByOwner(req.merchantAddress!);
    if (!merchant) {
      res.status(404).json({ ok: false, message: "Merchant profile missing" });
      return;
    }
    res.json({ ok: true, orders: listOrders(merchant.id) });
  },
);

const suggestTagsSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(200).optional(),
});

merchantsRouter.post(
  "/suggest-tags",
  requireMerchant,
  async (req: AuthedRequest, res) => {
    const parsed = suggestTagsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, errors: parsed.error.flatten() });
      return;
    }
    try {
      const result = await suggestProductTags(parsed.data);
      res.json({ ok: true, tags: result.tags, source: result.source });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suggest tags failed";
      res.status(500).json({ ok: false, message });
    }
  },
);

merchantsRouter.post(
  "/me/products",
  requireMerchant,
  (req: AuthedRequest, res) => {
    const merchant = findMerchantByOwner(req.merchantAddress!);
    if (!merchant) {
      res.status(404).json({ ok: false, message: "Merchant profile missing" });
      return;
    }
    const parsed = productSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, errors: parsed.error.flatten() });
      return;
    }
    const product = upsertProduct({
      id: parsed.data.id ?? newId("prod"),
      merchantId: merchant.id,
      name: parsed.data.name,
      unit: parsed.data.unit,
      price: parsed.data.price,
      stock: parsed.data.stock,
      tags: parsed.data.tags.map((t) => t.toLowerCase()),
    });
    res.json({ ok: true, product });
  },
);

merchantsRouter.delete(
  "/me/products/:id",
  requireMerchant,
  (req: AuthedRequest, res) => {
    const merchant = findMerchantByOwner(req.merchantAddress!);
    if (!merchant) {
      res.status(404).json({ ok: false, message: "Merchant profile missing" });
      return;
    }
    const removed = deleteProduct(String(req.params.id), merchant.id);
    if (!removed) {
      res.status(404).json({ ok: false, message: "Product not found" });
      return;
    }
    res.json({ ok: true });
  },
);

merchantsRouter.get("/:id/catalog", (req, res) => {
  const merchant = getMerchant(req.params.id);
  if (!merchant) {
    res.status(404).json({ ok: false, message: "Merchant not found" });
    return;
  }
  res.json({ ok: true, products: listProducts(merchant.id) });
});

merchantsRouter.get("/:id", (req, res) => {
  const merchant = getMerchant(req.params.id);
  if (!merchant) {
    res.status(404).json({ ok: false, message: "Merchant not found" });
    return;
  }
  res.json({
    ok: true,
    merchant,
    products: listProducts(merchant.id),
  });
});
