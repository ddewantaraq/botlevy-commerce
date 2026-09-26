export type Quote = {
  id: string;
  merchantId: string;
  merchantName: string;
  payTo: string;
  total: number;
  lines: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    tag: string;
    unit?: string;
    needQty?: number;
    needUnit?: string;
  }>;
  substitutions?: Array<{ fromTag: string; toTag: string; reason: string }>;
};

export type Plan = {
  dish: string;
  steps: string[];
  ingredients: Array<{ tag: string; name: string; qty: number; unit: string }>;
};

export type Suggestion = { dish: string; reason: string; ingredientsPreview?: string[] };

export type CookingSession = {
  id: string;
  status: "prep" | "cooking" | "post_cook" | "done" | "abandoned";
  dish: string;
  plan: Plan;
  prepChecks: Record<string, boolean>;
  prepGuide?: "ask" | "walk" | "free";
  prepIndex?: number;
  stepIndex: number;
};

export type PendingCookStart = {
  reply: string;
  speak?: string;
  cookStep?: ChatMessage["cookStep"];
  prepStep?: ChatMessage["prepStep"];
  prepChecks?: Record<string, boolean>;
  plan?: Plan;
  sessionId: string;
  kind: ChatMessage["kind"];
};

export type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  at: string;
  kind?: "text" | "plan_result" | "prep" | "prep_step" | "cook_step" | "prep_ask";
  status?: string;
  intent?: string;
  suggestions?: Suggestion[];
  plan?: Plan;
  quote?: Quote;
  steps?: Array<{
    tool: string;
    args?: unknown;
    result?: unknown;
    error?: string;
    llm?: {
      label: string;
      model: string;
      system?: string;
      user: string;
      raw: string;
      ms: number;
      parseOk?: boolean;
    };
  }>;
  runId?: string;
  cookStep?: { index: number; total: number; text: string };
  prepStep?: { index: number; total: number; tag: string; text: string };
  sessionId?: string;
  prepChecks?: Record<string, boolean>;
};
