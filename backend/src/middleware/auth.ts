import type { Request, Response, NextFunction } from "express";
import { getSession, type SessionRole } from "../store.js";

export type AuthedRequest = Request & {
  merchantAddress?: string;
  sessionAddress?: string;
  sessionRole?: SessionRole;
};

function readSession(req: AuthedRequest, res: Response, role: SessionRole) {
  const sid = req.cookies?.sid as string | undefined;
  const session = getSession(sid);
  if (!session || session.role !== role) {
    res.status(401).json({
      ok: false,
      message: role === "merchant" ? "Merchant login required" : "Cooker login required",
    });
    return null;
  }
  req.sessionAddress = session.address;
  req.sessionRole = session.role;
  if (role === "merchant") req.merchantAddress = session.address;
  return session;
}

export function requireMerchant(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  if (!readSession(req, res, "merchant")) return;
  next();
}

export function requireCooker(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  if (!readSession(req, res, "cooker")) return;
  next();
}
