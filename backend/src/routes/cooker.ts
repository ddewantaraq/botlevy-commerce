import { Router } from "express";
import { z } from "zod";
import { requireCooker, type AuthedRequest } from "../middleware/auth.js";
import {
  deleteCookerMenu,
  getActiveCookingSession,
  getCookerPantry,
  getCookingSession,
  listCookerMenus,
  saveCookerMenu,
  saveCookingSession,
  setCookerPantry,
} from "../store.js";
import { handleSessionMessage, applySaveMenu } from "../cooker/session-message.js";
import { startPrepSession } from "../cooker/start-prep.js";

export const cookerRouter = Router();

cookerRouter.use(requireCooker);

cookerRouter.get("/pantry", (req: AuthedRequest, res) => {
  res.json({ ok: true, pantry: getCookerPantry(req.sessionAddress!) });
});

const pantrySchema = z.object({
  pantry: z.array(z.string()),
});

cookerRouter.put("/pantry", (req: AuthedRequest, res) => {
  const parsed = pantrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, errors: parsed.error.flatten() });
    return;
  }
  const pantry = setCookerPantry(req.sessionAddress!, parsed.data.pantry);
  res.json({ ok: true, pantry });
});

cookerRouter.get("/menus", (req: AuthedRequest, res) => {
  res.json({ ok: true, menus: listCookerMenus(req.sessionAddress!) });
});

const menuSchema = z.object({
  dish: z.string().min(1),
  plan: z.object({
    dish: z.string(),
    steps: z.array(z.string()).min(1),
    ingredients: z.array(
      z.object({
        tag: z.string(),
        name: z.string(),
        qty: z.number(),
        unit: z.string(),
      }),
    ),
  }),
  pantrySnapshot: z.array(z.string()).optional().default([]),
});

cookerRouter.post("/menus", (req: AuthedRequest, res) => {
  const parsed = menuSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, errors: parsed.error.flatten() });
    return;
  }
  const menu = saveCookerMenu(req.sessionAddress!, parsed.data);
  res.json({ ok: true, menu });
});

cookerRouter.delete("/menus/:id", (req: AuthedRequest, res) => {
  const ok = deleteCookerMenu(req.sessionAddress!, String(req.params.id));
  if (!ok) {
    res.status(404).json({ ok: false, message: "Menu not found" });
    return;
  }
  res.json({ ok: true });
});

cookerRouter.get("/sessions/active", (req: AuthedRequest, res) => {
  const session = getActiveCookingSession(req.sessionAddress!);
  res.json({ ok: true, session });
});

const startSchema = z
  .object({
    runId: z.string().optional(),
    menuId: z.string().optional(),
    orderId: z.string().optional(),
    quoteId: z.string().optional(),
  })
  .refine((b) => Boolean(b.runId || b.menuId), {
    message: "runId or menuId required",
  });

cookerRouter.post("/sessions", (req: AuthedRequest, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, errors: parsed.error.flatten() });
    return;
  }

  const result = startPrepSession({
    address: req.sessionAddress!,
    runId: parsed.data.runId,
    menuId: parsed.data.menuId,
    quoteId: parsed.data.quoteId,
    orderId: parsed.data.orderId,
  });
  if (!result.ok) {
    res.status(result.status).json({ ok: false, message: result.message });
    return;
  }
  res.json({
    ok: true,
    session: result.session,
    reply: result.reply,
  });
});

const patchSchema = z.object({
  prepChecks: z.record(z.boolean()).optional(),
  status: z
    .enum(["prep", "cooking", "post_cook", "done", "abandoned"])
    .optional(),
  stepIndex: z.number().int().nonnegative().optional(),
  pendingConfirm: z.enum(["abandon_replan"]).nullable().optional(),
});

cookerRouter.patch("/sessions/:id", (req: AuthedRequest, res) => {
  const session = getCookingSession(String(req.params.id));
  if (!session || session.cookerAddress !== req.sessionAddress!.toLowerCase()) {
    res.status(404).json({ ok: false, message: "Session not found" });
    return;
  }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, errors: parsed.error.flatten() });
    return;
  }
  if (parsed.data.prepChecks) {
    session.prepChecks = { ...session.prepChecks, ...parsed.data.prepChecks };
  }
  if (parsed.data.status) session.status = parsed.data.status;
  if (typeof parsed.data.stepIndex === "number") {
    session.stepIndex = parsed.data.stepIndex;
  }
  if (parsed.data.pendingConfirm !== undefined) {
    session.pendingConfirm = parsed.data.pendingConfirm;
  }
  session.updatedAt = new Date().toISOString();
  saveCookingSession(session);
  res.json({ ok: true, session });
});

const messageSchema = z.object({
  text: z.string().min(1).max(500),
});

cookerRouter.post("/sessions/:id/message", async (req: AuthedRequest, res) => {
  const session = getCookingSession(String(req.params.id));
  if (!session || session.cookerAddress !== req.sessionAddress!.toLowerCase()) {
    res.status(404).json({ ok: false, message: "Session not found" });
    return;
  }
  if (
    session.status !== "prep" &&
    session.status !== "cooking" &&
    session.status !== "post_cook"
  ) {
    res.status(400).json({
      ok: false,
      message: "Session is not active (prep/cooking/post_cook)",
      session,
    });
    return;
  }
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, errors: parsed.error.flatten() });
    return;
  }

  try {
    const result = await handleSessionMessage(session, parsed.data.text);
    res.json({
      ok: true,
      session: result.session,
      reply: result.reply,
      cookStep: result.cookStep,
      handoff: result.handoff,
      speak: result.speak,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Session message failed";
    console.error("[cooker] session message failed:", err);
    res.status(500).json({ ok: false, message });
  }
});

cookerRouter.post("/sessions/:id/save", (req: AuthedRequest, res) => {
  const session = getCookingSession(String(req.params.id));
  if (!session || session.cookerAddress !== req.sessionAddress!.toLowerCase()) {
    res.status(404).json({ ok: false, message: "Session not found" });
    return;
  }
  if (
    session.status !== "prep" &&
    session.status !== "cooking" &&
    session.status !== "post_cook"
  ) {
    res.status(400).json({
      ok: false,
      message: "Session is not active",
      session,
    });
    return;
  }
  const result = applySaveMenu(session);
  res.json({
    ok: true,
    session: result.session,
    reply: result.reply,
    menuId: result.session.menuId,
    handoff: result.handoff,
    speak: result.speak,
  });
});
