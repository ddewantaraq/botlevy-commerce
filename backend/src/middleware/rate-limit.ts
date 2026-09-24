import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

/** Stricter limit for unauthenticated POST /agent/public/runs. */
export const publicAgentLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "rate_limited", message: "Too many public agent requests" },
});
