import { Router } from "express";
import crypto from "node:crypto";
import { SiweMessage } from "siwe";
import { BSC_TESTNET_CHAIN_ID, cookieSecure } from "../config.js";
import { authLimiter } from "../middleware/rate-limit.js";
import {
  consumeNonce,
  createNonce,
  createSession,
  deleteSession,
  findMerchantByOwner,
  getSession,
  newId,
  upsertMerchant,
  type SessionRole,
} from "../store.js";

export const authRouter = Router();
authRouter.use(authLimiter);

authRouter.get("/nonce", (_req, res) => {
  const nonce = crypto.randomBytes(16).toString("hex");
  createNonce(nonce);
  res.json({ nonce });
});

authRouter.post("/verify", async (req, res) => {
  try {
    const { message, signature } = req.body;
    if (!message || !signature) {
      res.status(400).json({ ok: false, message: "Missing message or signature" });
      return;
    }

    const siweMessage = new SiweMessage(message);
    const result = await siweMessage.verify({ signature });
    if (!result.success) {
      res.status(401).json({ ok: false, message: "Invalid signature" });
      return;
    }

    if (siweMessage.chainId !== BSC_TESTNET_CHAIN_ID) {
      res.status(401).json({
        ok: false,
        message: `Wrong chain. Expected BSC Testnet ${BSC_TESTNET_CHAIN_ID}`,
      });
      return;
    }

    if (!consumeNonce(siweMessage.nonce)) {
      res.status(401).json({ ok: false, message: "Invalid or expired nonce" });
      return;
    }

    const role = req.body.role as SessionRole | undefined;
    if (role !== "cooker" && role !== "merchant") {
      res.status(400).json({ ok: false, message: "role must be cooker or merchant" });
      return;
    }

    const address = siweMessage.address.toLowerCase();
    let merchant = null;
    if (role === "merchant") {
      merchant = findMerchantByOwner(address);
      if (!merchant) {
        merchant = upsertMerchant({
          id: newId("m"),
          name: `Shop ${address.slice(0, 6)}…${address.slice(-4)}`,
          payTo: address,
          ownerAddress: address,
          location: "",
          updatedAt: new Date().toISOString(),
        });
      } else if (merchant.payTo.toLowerCase() !== address) {
        merchant = upsertMerchant({
          ...merchant,
          payTo: address,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const sessionId = crypto.randomBytes(32).toString("hex");
    createSession(sessionId, address, role);
    res.cookie("sid", sessionId, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "lax",
      maxAge: 60 * 60 * 1000,
    });

    res.json({ ok: true, address, role, merchant });
  } catch (error) {
    console.error("[auth] verify failed:", error);
    res.status(500).json({ ok: false, message: "Verification failed" });
  }
});

authRouter.get("/me", (req, res) => {
  const session = getSession(req.cookies?.sid);
  if (!session) {
    res.status(401).json({ ok: false });
    return;
  }
  const merchant =
    session.role === "merchant" ? findMerchantByOwner(session.address) : null;
  res.json({ ok: true, address: session.address, role: session.role, merchant });
});

authRouter.post("/logout", (req, res) => {
  const sid = req.cookies?.sid as string | undefined;
  if (sid) deleteSession(sid);
  res.clearCookie("sid");
  res.json({ ok: true });
});
