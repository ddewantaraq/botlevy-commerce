import { Router } from "express";
import { z } from "zod";
import type { AuthedRequest } from "../middleware/auth.js";
import { requireCooker, requireMerchant } from "../middleware/auth.js";
import { verifyMockUsdcTransfer } from "../payments/verify.js";
import {
  decrementProductStock,
  findMerchantByOwner,
  getOrder,
  getQuote,
  isRealPayTo,
  listOrders,
  newId,
  saveOrder,
  updateOrderStatus,
} from "../store.js";

export const ordersRouter = Router();

const createSchema = z.object({
  quoteId: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

ordersRouter.post("/", requireCooker, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, errors: parsed.error.flatten() });
    return;
  }

  const payer = req.sessionAddress!;
  const quote = getQuote(parsed.data.quoteId);
  if (!quote) {
    res.status(404).json({ ok: false, message: "Quote not found" });
    return;
  }
  if (!isRealPayTo(quote.payTo)) {
    res.status(400).json({ ok: false, message: "Quote payTo is not a real wallet address" });
    return;
  }
  if (new Date(quote.expiresAt).getTime() < Date.now()) {
    res.status(400).json({ ok: false, message: "Quote expired — run the agent again" });
    return;
  }

  const check = await verifyMockUsdcTransfer({
    txHash: parsed.data.txHash,
    expectedTo: quote.payTo,
    expectedAmount: quote.total,
    expectedFrom: payer,
  });

  if (!check.ok) {
    res.status(400).json({ ok: false, message: check.message });
    return;
  }

  const existing = listOrders().find(
    (o) => o.txHash.toLowerCase() === parsed.data.txHash.toLowerCase(),
  );
  if (existing) {
    res.json({ ok: true, order: existing, reused: true });
    return;
  }

  for (const line of quote.lines) {
    decrementProductStock(line.productId, line.qty);
  }

  const order = saveOrder({
    id: newId("ord"),
    merchantId: quote.merchantId,
    payer,
    payTo: quote.payTo,
    total: quote.total,
    txHash: parsed.data.txHash,
    status: "paid",
    lines: quote.lines,
    createdAt: new Date().toISOString(),
  });

  res.json({
    ok: true,
    order,
    explorerUrl: `https://testnet.bscscan.com/tx/${order.txHash}`,
  });
});

ordersRouter.get("/", (req, res) => {
  const merchantId = req.query.merchantId as string | undefined;
  res.json({ ok: true, orders: listOrders(merchantId) });
});

ordersRouter.get("/:id", (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) {
    res.status(404).json({ ok: false, message: "Order not found" });
    return;
  }
  res.json({
    ok: true,
    order,
    explorerUrl: `https://testnet.bscscan.com/tx/${order.txHash}`,
  });
});

ordersRouter.post(
  "/:id/fulfill",
  requireMerchant,
  (req: AuthedRequest, res) => {
    const orderId = String(req.params.id);
    const order = getOrder(orderId);
    if (!order) {
      res.status(404).json({ ok: false, message: "Order not found" });
      return;
    }
    const merchant = findMerchantByOwner(req.merchantAddress!);
    if (!merchant || merchant.id !== order.merchantId) {
      res.status(403).json({ ok: false, message: "Not your order" });
      return;
    }
    const updated = updateOrderStatus(order.id, "fulfilled");
    res.json({ ok: true, order: updated });
  },
);
