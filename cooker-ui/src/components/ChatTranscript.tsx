import { formatIngredientLabel } from "@botlevy-commerce/shared";
import type { ChatMessage, CookingSession, Plan, Quote } from "../types/chat";
import { QuotePayCard } from "./QuotePayCard";

type Props = {
  messages: ChatMessage[];
  busy: boolean;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  session: CookingSession | null;
  pendingHandsFreeAsk: boolean;
  paying: boolean;
  confirmingPay: boolean;
  signedIn: boolean;
  onSend: (text: string) => void;
  onTogglePrepTag: (tag: string, value: boolean) => void;
  onPickDish: (dish: string) => void;
  onPayQuote: (quote: Quote, runId?: string) => void;
  onStartPrep: (runId: string) => void;
  onSaveMenu: (plan: Plan) => void;
};

export function ChatTranscript({
  messages,
  busy,
  bottomRef,
  session,
  pendingHandsFreeAsk,
  paying,
  confirmingPay,
  signedIn,
  onSend,
  onTogglePrepTag,
  onPickDish,
  onPayQuote,
  onStartPrep,
  onSaveMenu,
}: Props) {
  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
              m.role === "user"
                ? "bg-[var(--bubble-user)] text-white"
                : "border border-[var(--line)] bg-[var(--bubble-agent)] text-[var(--ink)]"
            }`}
          >
            {m.kind === "cook_step" && m.cookStep ? (
              <div>
                <p className="text-xs font-medium text-[var(--accent)]">
                  Langkah {m.cookStep.index + 1}/{m.cookStep.total}
                </p>
                <p className="mt-2 text-2xl font-semibold leading-snug tracking-tight">
                  {m.cookStep.text}
                </p>
                <p className="mt-3 text-xs text-[var(--body)]">
                  Mic atau ketik: lanjut · balik · ulang · selesai · ganti menu
                </p>
              </div>
            ) : m.kind === "prep_step" && m.prepStep ? (
              <div>
                <p className="text-xs font-medium text-[var(--accent)]">
                  Bahan {m.prepStep.index + 1}/{m.prepStep.total}
                </p>
                <p className="mt-2 text-2xl font-semibold leading-snug tracking-tight">
                  {m.prepStep.text}
                </p>
                <p className="mt-3 text-xs text-[var(--body)]">
                  Mic atau ketik: lanjut · balik · ulang · mulai masak
                </p>
              </div>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
            )}

            {m.kind === "prep_ask" &&
            session?.status === "prep" &&
            session.prepGuide === "ask" &&
            !pendingHandsFreeAsk ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSend("satu-satu")}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  Satu-satu
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onSend("langsung")}
                  className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50"
                >
                  Langsung
                </button>
              </div>
            ) : null}

            {m.kind === "prep" && m.prepChecks ? (
              <ul className="mt-3 space-y-2">
                {Object.entries(m.prepChecks).map(([tag, ok]) => {
                  const ing = (m.plan ?? session?.plan)?.ingredients.find(
                    (i) => i.tag.toLowerCase() === tag.toLowerCase(),
                  );
                  const label = formatIngredientLabel({
                    name: ing?.name,
                    tag,
                    qty: ing?.qty,
                    unit: ing?.unit,
                  });
                  return (
                    <li key={tag}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={session?.prepChecks?.[tag] ?? ok}
                          onChange={(e) =>
                            onTogglePrepTag(tag, e.target.checked)
                          }
                        />
                        <span>{label}</span>
                      </label>
                    </li>
                  );
                })}
                <li className="pt-1 text-xs text-[var(--body)]">
                  Kalau semua bahan sudah siap, bilang atau ketik{" "}
                  <strong>mulai masak</strong>
                </li>
              </ul>
            ) : null}

            {m.suggestions?.length ? (
              <div className="mt-3 flex flex-col gap-2">
                {m.suggestions.map((s) => (
                  <button
                    key={s.dish}
                    type="button"
                    disabled={busy}
                    onClick={() => onPickDish(s.dish)}
                    className="rounded-xl border border-[var(--line)] bg-[var(--canvas)] px-3 py-2 text-left text-sm hover:border-[var(--accent)]"
                  >
                    <span className="font-semibold text-[var(--accent)]">
                      {s.dish}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--body)]">
                      {s.reason}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}

            {m.quote ? (
              <QuotePayCard
                quote={m.quote}
                runId={m.runId}
                paying={paying}
                confirmingPay={confirmingPay}
                signedIn={signedIn}
                onPay={onPayQuote}
              />
            ) : null}

            {m.status === "cookable" && m.runId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onStartPrep(m.runId!)}
                className="mt-3 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white"
              >
                Siapkan bahan (pre-cook)
              </button>
            ) : null}

            {m.plan &&
            (m.status === "cookable" ||
              session?.status === "done" ||
              session?.status === "post_cook" ||
              m.kind === "cook_step" ||
              m.kind === "prep") ? (
              <button
                type="button"
                onClick={() => onSaveMenu(m.plan!)}
                className="mt-2 ml-0 block text-xs text-[var(--accent)] underline"
              >
                Simpan menu
              </button>
            ) : null}

            {m.steps?.length ? (
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer text-[var(--body)]">
                  Agent steps
                </summary>
                <ol className="mt-1 space-y-2 font-mono">
                  {m.steps.map((s, i) => (
                    <li
                      key={`${s.tool}-${i}`}
                      className="border-t border-[var(--line)] pt-1 first:border-0 first:pt-0"
                    >
                      <div>
                        {s.tool}
                        {s.error ? ` — ${s.error}` : ""}
                        {s.llm?.parseOk === false ? " — parseOk:false" : ""}
                        {s.llm?.ms != null ? ` (${s.llm.ms}ms)` : ""}
                      </div>
                      {import.meta.env.VITE_AGENT_DEBUG === "true" ||
                      import.meta.env.VITE_AGENT_DEBUG === "1" ? (
                        <div className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all text-[10px] text-[var(--body)] opacity-90">
                          {s.args != null ? (
                            <div>
                              <span className="font-sans opacity-70">args </span>
                              {JSON.stringify(s.args, null, 0)}
                            </div>
                          ) : null}
                          {s.result != null ? (
                            <div>
                              <span className="font-sans opacity-70">result </span>
                              {JSON.stringify(s.result, null, 0)}
                            </div>
                          ) : null}
                          {s.llm ? (
                            <div className="mt-1 space-y-1">
                              <div>
                                <span className="font-sans opacity-70">llm.user </span>
                                {s.llm.user}
                              </div>
                              <div>
                                <span className="font-sans opacity-70">llm.raw </span>
                                {s.llm.raw}
                              </div>
                              {s.llm.system ? (
                                <div>
                                  <span className="font-sans opacity-70">llm.system </span>
                                  {s.llm.system.slice(0, 500)}
                                  {s.llm.system.length > 500 ? "…" : ""}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
        </div>
      ))}
      {busy ? (
        <p className="text-center text-xs text-[var(--body)]">Agent berpikir…</p>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
