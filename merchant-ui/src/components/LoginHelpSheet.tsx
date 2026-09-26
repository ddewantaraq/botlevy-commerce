import { LOGIN_HELP } from "@botlevy-commerce/shared";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function LoginHelpSheet({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-help-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--line)] bg-[var(--canvas)] p-5 shadow-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="login-help-title"
              className="text-lg font-semibold text-[var(--ink)]"
            >
              {LOGIN_HELP.title}
            </h2>
            <p className="text-xs text-[var(--muted)]">{LOGIN_HELP.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white text-lg text-[var(--ink)]"
          >
            ×
          </button>
        </div>

        <ol className="mt-4 space-y-4">
          {LOGIN_HELP.steps.map((s) => (
            <li key={s.title}>
              <p className="text-sm font-semibold text-[var(--ink)]">{s.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--body)]">
                {s.body}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
          {LOGIN_HELP.faucetHint}
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-12 w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white"
        >
          {LOGIN_HELP.closeLabel}
        </button>
      </div>
    </div>
  );
}
