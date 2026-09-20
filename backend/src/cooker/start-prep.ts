import {
  abandonActiveSessions,
  clearLastReadyRun,
  clearPendingStartPrep,
  clearPlanningDraft,
  getCookerMenu,
  getRun,
  newId,
  saveCookingSession,
  type CookingSession,
} from "../store.js";
import { buildPrepChecks, formatPrepIntro } from "./session-message.js";

export type StartPrepOk = {
  ok: true;
  session: CookingSession;
  reply: string;
};

export type StartPrepErr = {
  ok: false;
  status: number;
  message: string;
};

export type StartPrepResult = StartPrepOk | StartPrepErr;

/**
 * Start a prep cooking session from a cookable/quoted run or a saved menu.
 */
export function startPrepSession(opts: {
  address: string;
  runId?: string;
  menuId?: string;
  quoteId?: string;
  orderId?: string;
}): StartPrepResult {
  const address = opts.address.toLowerCase();
  let dish = "";
  let plan: CookingSession["plan"] | null = null;
  let runId: string | undefined;
  let menuId: string | undefined;

  if (opts.runId) {
    const run = getRun(opts.runId);
    if (!run?.plan) {
      return { ok: false, status: 400, message: "Run has no recipe plan" };
    }
    if (run.status !== "cookable" && run.status !== "quoted") {
      return {
        ok: false,
        status: 400,
        message: "Start prep from a cookable or quoted run",
      };
    }
    plan = run.plan;
    dish = run.plan.dish;
    runId = run.id;
  } else if (opts.menuId) {
    const menu = getCookerMenu(address, opts.menuId);
    if (!menu) {
      return { ok: false, status: 404, message: "Menu not found" };
    }
    plan = menu.plan;
    dish = menu.dish;
    menuId = menu.id;
  }

  if (!plan) {
    return { ok: false, status: 400, message: "No plan" };
  }

  abandonActiveSessions(address);
  clearPlanningDraft(address);
  clearPendingStartPrep(address);
  clearLastReadyRun(address);

  const session: CookingSession = {
    id: newId("cook"),
    cookerAddress: address,
    status: "prep",
    runId,
    menuId,
    dish,
    plan,
    prepChecks: buildPrepChecks(plan.ingredients),
    prepGuide: "ask",
    prepIndex: 0,
    stepIndex: 0,
    pendingConfirm: null,
    quoteId: opts.quoteId,
    orderId: opts.orderId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  saveCookingSession(session);

  return {
    ok: true,
    session,
    reply: formatPrepIntro(session),
  };
}
