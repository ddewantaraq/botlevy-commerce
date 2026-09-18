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

export type AgentStep = {
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: string;
  at: string;
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

export type CookingSession = {
  id: string;
  cookerAddress: string;
  status: CookingSessionStatus;
  runId?: string;
  menuId?: string;
  dish: string;
  plan: RecipePlan;
  prepChecks: Record<string, boolean>;
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

export type PlanningDraftPhase = "await_bahan" | "confirm_gap";

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
  sessions: Record<string, Session>;
  nonces: Record<string, Nonce>;
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
    sessions: {},
    nonces: {},
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
      merchants: parsed.merchants ?? [],
      products: parsed.products ?? [],
      orders: parsed.orders ?? [],
      quotes: parsed.quotes ?? [],
      runs: parsed.runs ?? [],
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
