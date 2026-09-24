import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
const runtimePath = path.join(dataDir, "runtime.json");

export type Ingredient = {
  tag: string;
  name: string;
  qty: number;
  unit: string;
};

export type Product = {
  id: string;
  merchantId: string;
  name: string;
  unit: string;
  price: number; // MockUSDC base units (6 decimals)
  stock: number;
  tags: string[];
};

export type SessionRole = "cooker" | "merchant";

export const PLACEHOLDER_PAYTO = "0x0000000000000000000000000000000000000001";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isRealPayTo(address: string | undefined | null): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(a) && a !== PLACEHOLDER_PAYTO && a !== ZERO_ADDRESS;
}

export type Merchant = {
  id: string;
  name: string;
  payTo: string;
  ownerAddress: string;
  location: string;
  updatedAt?: string;
};

export type OrderStatus = "paid" | "fulfilled";

export type OrderLine = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
  tag: string;
  /** Merchant product sell unit (kg, g, …). */
  unit?: string;
  /** Recipe need qty (e.g. 500). */
  needQty?: number;
  /** Recipe need unit (e.g. g). */
  needUnit?: string;
};

export type Order = {
  id: string;
  merchantId: string;
  payer: string;
  payTo: string;
  total: number;
  txHash: string;
  status: OrderStatus;
  lines: OrderLine[];
  createdAt: string;
};

export type Quote = {
  id: string;
  merchantId: string;
  merchantName: string;
  payTo: string;
  tokenAddress: string;
  chainId: number;
  total: number;
  lines: OrderLine[];
  substitutions: Array<{ fromTag: string; toTag: string; reason: string }>;
  expiresAt: string;
};

export type AgentStepLlm = {
  label: string;
  model: string;
  system?: string;
  user: string;
  raw: string;
  ms: number;
  parseOk?: boolean;
};

export type AgentStep = {
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  at: string;
  /** Present when LLM_TRACE=1 and this step used the LLM. */
  llm?: AgentStepLlm;
};

export type AgentIntent = "known_dish" | "pantry_first" | "open_goal";

export type AgentRunStatus =
  | "suggestions"
  | "cookable"
  | "quoted"
  | "no_merchant"
  | "failed";

export type DishSuggestion = {
  dish: string;
  reason: string;
  ingredientsPreview?: string[];
};

export type AgentRun = {
  id: string;
  goal: string;
  pantry: string[];
  steps: AgentStep[];
  intent?: AgentIntent;
  status: AgentRunStatus;
  suggestions?: DishSuggestion[];
  selectedDish?: string;
  plan?: {
    dish: string;
    steps: string[];
    ingredients: Ingredient[];
  };
  missing?: Ingredient[];
  quote?: Quote;
  createdAt: string;
};

export type RecipePlan = {
  dish: string;
  steps: string[];
  ingredients: Ingredient[];
};

export type SavedMenu = {
  id: string;
  dish: string;
  plan: RecipePlan;
  pantrySnapshot: string[];
  createdAt: string;
};

export type CookingSessionStatus =
  | "prep"
  | "cooking"
  | "post_cook"
  | "done"
  | "abandoned";

export type PrepGuide = "ask" | "walk" | "free";

export type CookingSession = {
  id: string;
  cookerAddress: string;
  status: CookingSessionStatus;
  runId?: string;
  menuId?: string;
  dish: string;
  plan: RecipePlan;
  prepChecks: Record<string, boolean>;
  /** Mode for persiapan bahan: ask choice, one-by-one walk, or free checklist. */
  prepGuide?: PrepGuide;
  /** Index into ordered prep tags while prepGuide === "walk". */
  prepIndex?: number;
  stepIndex: number;
  pendingConfirm?: "abandon_replan" | null;
  quoteId?: string;
  orderId?: string;
  updatedAt: string;
  createdAt: string;
};

function isActiveCookingStatus(status: CookingSessionStatus): boolean {
  return status === "prep" || status === "cooking" || status === "post_cook";
}

export type CookerProfile = {
  address: string;
  pantry: string[];
  menus: SavedMenu[];
};

export type PlanningDraftPhase =
  | "await_bahan"
  | "confirm_gap"
  | "ask_quote"
  | "idle";

export type PlanningDraft = {
  cookerAddress: string;
  dish: string;
  phase: PlanningDraftPhase;
  userBahan: string[];
  plan?: RecipePlan;
  missing?: Ingredient[];
  updatedAt: string;
};

type Session = { address: string; role: SessionRole; createdAt: number };
type Nonce = { createdAt: number };

type Db = {
  merchants: Merchant[];
  products: Product[];
  orders: Order[];
  quotes: Quote[];
  runs: AgentRun[];
  cookerProfiles: CookerProfile[];
  cookingSessions: CookingSession[];
  planningDrafts: PlanningDraft[];
  /** Last menu suggestions per cooker (for chat/speak pick). */
  lastSuggestions: Array<{
    cookerAddress: string;
    dishes: string[];
    updatedAt: string;
  }>;
  /** Pantry tags from last pantry_first / suggestions run. */
  lastPlanningPantry: Array<{
    cookerAddress: string;
    tags: string[];
    updatedAt: string;
  }>;
  /** Awaiting “yakin?” after batal / menu baru. */
  pendingResets: Array<{ cookerAddress: string; updatedAt: string }>;
  /** Last cookable/quoted run ready for pre-cook. */
  lastReadyRuns: Array<{
    cookerAddress: string;
    runId: string;
    updatedAt: string;
  }>;
  /** Awaiting mulai/ya to start prep after cookable offer. */
  pendingStartPreps: Array<{
    cookerAddress: string;
    runId: string;
    updatedAt: string;
  }>;
  sessions: Record<string, Session>;
  nonces: Record<string, Nonce>;
  /** Consumed x402 payment tx hashes (one-time use). */
  spentPaymentTxs: Array<{ txHash: string; claimedAt: string }>;
};

function emptyDb(): Db {
  return {
    merchants: [],
    products: [],
    orders: [],
    quotes: [],
    runs: [],
    cookerProfiles: [],
    cookingSessions: [],
    planningDrafts: [],
    lastSuggestions: [],
    lastPlanningPantry: [],
    pendingResets: [],
    lastReadyRuns: [],
    pendingStartPreps: [],
    sessions: {},
    nonces: {},
    spentPaymentTxs: [],
  };
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function load(): Db {
  ensureDataDir();
  if (!fs.existsSync(runtimePath)) return emptyDb();
  try {
    const parsed = JSON.parse(fs.readFileSync(runtimePath, "utf8")) as Partial<Db>;
    return {
      ...emptyDb(),
      ...parsed,
      cookerProfiles: parsed.cookerProfiles ?? [],
      cookingSessions: parsed.cookingSessions ?? [],
      planningDrafts: parsed.planningDrafts ?? [],
      lastSuggestions: parsed.lastSuggestions ?? [],
      lastPlanningPantry: parsed.lastPlanningPantry ?? [],
      pendingResets: parsed.pendingResets ?? [],
      lastReadyRuns: parsed.lastReadyRuns ?? [],
      pendingStartPreps: parsed.pendingStartPreps ?? [],
      merchants: parsed.merchants ?? [],
      products: parsed.products ?? [],
      orders: parsed.orders ?? [],
      quotes: parsed.quotes ?? [],
      runs: parsed.runs ?? [],
      spentPaymentTxs: parsed.spentPaymentTxs ?? [],
    };
  } catch {
    return emptyDb();
  }
}

function save(db: Db) {
  ensureDataDir();
  fs.writeFileSync(
    runtimePath,
    JSON.stringify(
      {
        merchants: db.merchants,
        products: db.products,
        orders: db.orders,
        quotes: db.quotes,
        runs: db.runs.slice(-50),
        cookerProfiles: db.cookerProfiles,
        cookingSessions: db.cookingSessions.slice(-100),
        planningDrafts: db.planningDrafts.slice(-50),
        lastSuggestions: db.lastSuggestions.slice(-50),
        lastPlanningPantry: db.lastPlanningPantry.slice(-50),
        pendingResets: db.pendingResets.slice(-50),
        lastReadyRuns: db.lastReadyRuns.slice(-50),
        pendingStartPreps: db.pendingStartPreps.slice(-50),
        spentPaymentTxs: db.spentPaymentTxs.slice(-500),
      },
      null,
      2,
    ),
  );
}

let db = load();

export function getDb() {
  return db;
}

export function persist() {
  save(db);
}

export function resetCatalogFromSeed(seed: { merchants: Merchant[]; products: Product[] }) {
  db.merchants = seed.merchants;
  db.products = seed.products;
  persist();
}

export function createNonce(nonce: string) {
  db.nonces[nonce] = { createdAt: Date.now() };
}

export function consumeNonce(nonce: string) {
  const entry = db.nonces[nonce];
  if (!entry) return false;
  if (Date.now() - entry.createdAt > 10 * 60 * 1000) {
    delete db.nonces[nonce];
    return false;
  }
  delete db.nonces[nonce];
  return true;
}

export function createSession(id: string, address: string, role: SessionRole) {
  db.sessions[id] = {
    address: address.toLowerCase(),
    role,
    createdAt: Date.now(),
  };
}

export function getSession(id: string | undefined) {
  if (!id) return null;
  const s = db.sessions[id];
  if (!s) return null;
  if (Date.now() - s.createdAt > 60 * 60 * 1000) {
    delete db.sessions[id];
    return null;
  }
  return s;
}

export function deleteSession(id: string) {
  delete db.sessions[id];
}

export function upsertMerchant(merchant: Merchant) {
  const idx = db.merchants.findIndex((m) => m.id === merchant.id);
  if (idx >= 0) db.merchants[idx] = merchant;
  else db.merchants.push(merchant);
  persist();
  return merchant;
}

export function findMerchantByOwner(address: string) {
  const a = address.toLowerCase();
  return db.merchants.find((m) => m.ownerAddress.toLowerCase() === a) ?? null;
}

export function listMerchants() {
  return db.merchants;
}

export function getMerchant(id: string) {
  return db.merchants.find((m) => m.id === id) ?? null;
}

export function listProducts(merchantId?: string) {
  return merchantId
    ? db.products.filter((p) => p.merchantId === merchantId)
    : db.products;
}

export function getProduct(id: string) {
  return db.products.find((p) => p.id === id) ?? null;
}

export function upsertProduct(product: Product) {
  const idx = db.products.findIndex((p) => p.id === product.id);
  if (idx >= 0) db.products[idx] = product;
  else db.products.push(product);
  const merchant = db.merchants.find((m) => m.id === product.merchantId);
  if (merchant) merchant.updatedAt = new Date().toISOString();
  persist();
  return product;
}

export function deleteProduct(id: string, merchantId: string) {
  const idx = db.products.findIndex((p) => p.id === id && p.merchantId === merchantId);
  if (idx < 0) return false;
  db.products.splice(idx, 1);
  const merchant = db.merchants.find((m) => m.id === merchantId);
  if (merchant) merchant.updatedAt = new Date().toISOString();
  persist();
  return true;
}

export function decrementProductStock(productId: string, qty: number) {
  const product = db.products.find((p) => p.id === productId);
  if (!product) return null;
  product.stock = Math.max(0, product.stock - qty);
  persist();
  return product;
}

export function saveQuote(quote: Quote) {
  db.quotes.push(quote);
  persist();
  return quote;
}

export function getQuote(id: string) {
  return db.quotes.find((q) => q.id === id) ?? null;
}

export function saveOrder(order: Order) {
  db.orders.unshift(order);
  persist();
  return order;
}

export function listOrders(merchantId?: string) {
  return merchantId
    ? db.orders.filter((o) => o.merchantId === merchantId)
    : db.orders;
}

export function getOrder(id: string) {
  return db.orders.find((o) => o.id === id) ?? null;
}

export function updateOrderStatus(id: string, status: OrderStatus) {
  const order = getOrder(id);
  if (!order) return null;
  order.status = status;
  persist();
  return order;
}

export function saveRun(run: AgentRun) {
  db.runs.unshift(run);
  persist();
  return run;
}

export function getRun(id: string) {
  return db.runs.find((r) => r.id === id) ?? null;
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function ensureCookerProfile(address: string): CookerProfile {
  const a = address.toLowerCase();
  let profile = db.cookerProfiles.find((p) => p.address === a);
  if (!profile) {
    profile = { address: a, pantry: [], menus: [] };
    db.cookerProfiles.push(profile);
    persist();
  }
  return profile;
}

export function getCookerPantry(address: string): string[] {
  return [...ensureCookerProfile(address).pantry];
}

export function setCookerPantry(address: string, pantry: string[]): string[] {
  const profile = ensureCookerProfile(address);
  const seen = new Set<string>();
  profile.pantry = pantry
    .map((t) => t.toLowerCase().trim())
    .filter((t) => {
      if (!t || seen.has(t)) return false;
      seen.add(t);
      return true;
    });
  persist();
  return [...profile.pantry];
}

export function listCookerMenus(address: string): SavedMenu[] {
  return [...ensureCookerProfile(address).menus];
}

export function saveCookerMenu(
  address: string,
  menu: Omit<SavedMenu, "id" | "createdAt"> & { id?: string },
): SavedMenu {
  const profile = ensureCookerProfile(address);
  const saved: SavedMenu = {
    id: menu.id ?? newId("menu"),
    dish: menu.dish,
    plan: menu.plan,
    pantrySnapshot: menu.pantrySnapshot,
    createdAt: new Date().toISOString(),
  };
  profile.menus.unshift(saved);
  profile.menus = profile.menus.slice(0, 30);
  persist();
  return saved;
}

export function deleteCookerMenu(address: string, menuId: string): boolean {
  const profile = ensureCookerProfile(address);
  const before = profile.menus.length;
  profile.menus = profile.menus.filter((m) => m.id !== menuId);
  if (profile.menus.length === before) return false;
  persist();
  return true;
}

export function getCookerMenu(address: string, menuId: string): SavedMenu | null {
  return ensureCookerProfile(address).menus.find((m) => m.id === menuId) ?? null;
}

export function saveCookingSession(session: CookingSession): CookingSession {
  const idx = db.cookingSessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) db.cookingSessions[idx] = session;
  else db.cookingSessions.unshift(session);
  persist();
  return session;
}

export function getCookingSession(id: string): CookingSession | null {
  return db.cookingSessions.find((s) => s.id === id) ?? null;
}

export function getActiveCookingSession(address: string): CookingSession | null {
  const a = address.toLowerCase();
  return (
    db.cookingSessions.find(
      (s) => s.cookerAddress === a && isActiveCookingStatus(s.status),
    ) ?? null
  );
}

export function abandonActiveSessions(address: string) {
  const a = address.toLowerCase();
  let changed = false;
  for (const s of db.cookingSessions) {
    if (s.cookerAddress === a && isActiveCookingStatus(s.status)) {
      s.status = "abandoned";
      s.pendingConfirm = null;
      s.updatedAt = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) persist();
}

export function getPlanningDraft(address: string): PlanningDraft | null {
  const a = address.toLowerCase();
  return db.planningDrafts.find((d) => d.cookerAddress === a) ?? null;
}

export function setPlanningDraft(draft: PlanningDraft): PlanningDraft {
  const a = draft.cookerAddress.toLowerCase();
  draft.cookerAddress = a;
  draft.updatedAt = new Date().toISOString();
  const idx = db.planningDrafts.findIndex((d) => d.cookerAddress === a);
  if (idx >= 0) db.planningDrafts[idx] = draft;
  else db.planningDrafts.unshift(draft);
  persist();
  return draft;
}

export function clearPlanningDraft(address: string): void {
  const a = address.toLowerCase();
  const before = db.planningDrafts.length;
  db.planningDrafts = db.planningDrafts.filter((d) => d.cookerAddress !== a);
  if (db.planningDrafts.length !== before) persist();
}

export function setLastSuggestions(address: string, dishes: string[]): void {
  const a = address.toLowerCase();
  const entry = {
    cookerAddress: a,
    dishes: dishes.map((d) => d.trim()).filter(Boolean),
    updatedAt: new Date().toISOString(),
  };
  const idx = db.lastSuggestions.findIndex((s) => s.cookerAddress === a);
  if (idx >= 0) db.lastSuggestions[idx] = entry;
  else db.lastSuggestions.unshift(entry);
  persist();
}

export function getLastSuggestions(address: string): string[] {
  const a = address.toLowerCase();
  return db.lastSuggestions.find((s) => s.cookerAddress === a)?.dishes ?? [];
}

export function clearLastSuggestions(address: string): void {
  const a = address.toLowerCase();
  const before = db.lastSuggestions.length;
  db.lastSuggestions = db.lastSuggestions.filter((s) => s.cookerAddress !== a);
  if (db.lastSuggestions.length !== before) persist();
}

export function setLastPlanningPantry(address: string, tags: string[]): void {
  const a = address.toLowerCase();
  const entry = {
    cookerAddress: a,
    tags: [
      ...new Set(
        tags
          .map((t) => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""))
          .filter(Boolean),
      ),
    ],
    updatedAt: new Date().toISOString(),
  };
  const idx = db.lastPlanningPantry.findIndex((s) => s.cookerAddress === a);
  if (idx >= 0) db.lastPlanningPantry[idx] = entry;
  else db.lastPlanningPantry.unshift(entry);
  persist();
}

export function getLastPlanningPantry(address: string): string[] {
  const a = address.toLowerCase();
  return db.lastPlanningPantry.find((s) => s.cookerAddress === a)?.tags ?? [];
}

export function clearLastPlanningPantry(address: string): void {
  const a = address.toLowerCase();
  const before = db.lastPlanningPantry.length;
  db.lastPlanningPantry = db.lastPlanningPantry.filter(
    (s) => s.cookerAddress !== a,
  );
  if (db.lastPlanningPantry.length !== before) persist();
}

export function setPendingReset(address: string): void {
  const a = address.toLowerCase();
  const entry = { cookerAddress: a, updatedAt: new Date().toISOString() };
  const idx = db.pendingResets.findIndex((s) => s.cookerAddress === a);
  if (idx >= 0) db.pendingResets[idx] = entry;
  else db.pendingResets.unshift(entry);
  persist();
}

export function hasPendingReset(address: string): boolean {
  const a = address.toLowerCase();
  return db.pendingResets.some((s) => s.cookerAddress === a);
}

export function clearPendingReset(address: string): void {
  const a = address.toLowerCase();
  const before = db.pendingResets.length;
  db.pendingResets = db.pendingResets.filter((s) => s.cookerAddress !== a);
  if (db.pendingResets.length !== before) persist();
}

export function setLastReadyRun(address: string, runId: string): void {
  const a = address.toLowerCase();
  const entry = {
    cookerAddress: a,
    runId,
    updatedAt: new Date().toISOString(),
  };
  const idx = db.lastReadyRuns.findIndex((s) => s.cookerAddress === a);
  if (idx >= 0) db.lastReadyRuns[idx] = entry;
  else db.lastReadyRuns.unshift(entry);
  persist();
}

export function getLastReadyRunId(address: string): string | null {
  const a = address.toLowerCase();
  return db.lastReadyRuns.find((s) => s.cookerAddress === a)?.runId ?? null;
}

export function clearLastReadyRun(address: string): void {
  const a = address.toLowerCase();
  const before = db.lastReadyRuns.length;
  db.lastReadyRuns = db.lastReadyRuns.filter((s) => s.cookerAddress !== a);
  if (db.lastReadyRuns.length !== before) persist();
}

export function setPendingStartPrep(address: string, runId: string): void {
  const a = address.toLowerCase();
  const entry = {
    cookerAddress: a,
    runId,
    updatedAt: new Date().toISOString(),
  };
  const idx = db.pendingStartPreps.findIndex((s) => s.cookerAddress === a);
  if (idx >= 0) db.pendingStartPreps[idx] = entry;
  else db.pendingStartPreps.unshift(entry);
  persist();
}

export function getPendingStartPrepRunId(address: string): string | null {
  const a = address.toLowerCase();
  return db.pendingStartPreps.find((s) => s.cookerAddress === a)?.runId ?? null;
}

export function hasPendingStartPrep(address: string): boolean {
  return getPendingStartPrepRunId(address) !== null;
}

export function clearPendingStartPrep(address: string): void {
  const a = address.toLowerCase();
  const before = db.pendingStartPreps.length;
  db.pendingStartPreps = db.pendingStartPreps.filter(
    (s) => s.cookerAddress !== a,
  );
  if (db.pendingStartPreps.length !== before) persist();
}

/** Mark a cookable/quoted run as ready for spoken mulai / ya. */
export function markReadyForPrep(address: string, runId: string): void {
  setLastReadyRun(address, runId);
  setPendingStartPrep(address, runId);
}

/** Clear all planning memory for a cooker (new chat). */
export function clearPlanningMemory(address: string): void {
  clearPlanningDraft(address);
  clearLastSuggestions(address);
  clearLastPlanningPantry(address);
  clearPendingReset(address);
  clearLastReadyRun(address);
  clearPendingStartPrep(address);
}

/** Fuzzy match user text to a previously suggested dish name. */
export function matchSuggestedDish(
  address: string,
  goal: string,
): string | null {
  const dishes = getLastSuggestions(address);
  if (!dishes.length) return null;
  const g = goal
    .trim()
    .toLowerCase()
    .replace(/^(pilih|pilihkan|saya\s+mau|mau|masak|cook)\s*:?\s*/i, "")
    .replace(/[.…,!?]+$/g, "")
    .trim();
  if (!g) return null;
  for (const dish of dishes) {
    const d = dish.toLowerCase().trim();
    if (!d) continue;
    if (g === d || g.includes(d) || d.includes(g)) return dish;
  }
  return null;
}

/** True if this payment tx hash was already consumed for a public run. */
export function isPaymentTxSpent(txHash: string): boolean {
  const key = txHash.toLowerCase();
  return load().spentPaymentTxs.some((t) => t.txHash === key);
}

/**
 * Atomically mark a payment tx as spent.
 * @returns true if newly claimed; false if already spent (replay).
 */
export function claimPaymentTx(txHash: string): boolean {
  const db = load();
  const key = txHash.toLowerCase();
  if (db.spentPaymentTxs.some((t) => t.txHash === key)) return false;
  db.spentPaymentTxs.push({
    txHash: key,
    claimedAt: new Date().toISOString(),
  });
  if (db.spentPaymentTxs.length > 500) {
    db.spentPaymentTxs = db.spentPaymentTxs.slice(-500);
  }
  save(db);
  return true;
}
