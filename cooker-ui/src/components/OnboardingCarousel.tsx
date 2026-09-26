import { useState } from "react";
import type { OnboardingStep } from "@botlevy-commerce/shared";

type Props = {
  steps: OnboardingStep[];
  onDone: () => void;
};

export function OnboardingCarousel({ steps, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index >= steps.length - 1;

  if (!step) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--canvas)]"
      style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding Botlevy Cooker"
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-6 pt-8">
        <p className="text-xs font-medium text-[var(--muted)]">
          {index + 1} / {steps.length}
        </p>
        <h1 className="mt-4 text-2xl font-semibold leading-tight text-[var(--ink)]">
          {step.title}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-[var(--body)]">
          {step.body}
        </p>
        {step.en ? (
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            {step.en}
          </p>
        ) : null}

        <div className="mt-auto flex gap-1.5 pb-6 pt-8">
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i === index ? "bg-[var(--accent)]" : "bg-[var(--line)]"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-lg gap-3 px-6 pb-6">
        <button
          type="button"
          onClick={onDone}
          className="min-h-12 flex-1 rounded-xl border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--ink)]"
        >
          Lewati
        </button>
        <button
          type="button"
          onClick={() => {
            if (isLast) onDone();
            else setIndex((i) => i + 1);
          }}
          className="min-h-12 flex-[1.4] rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white"
        >
          {isLast ? "Mulai" : "Lanjut"}
        </button>
      </div>
    </div>
  );
}
