export type OnboardingApp = "cooker" | "merchant";

function storageKey(app: OnboardingApp): string {
  return `botlevy.onboarding.${app}.v1`;
}

/** True when user finished or skipped onboarding (persists across PWA remounts). */
export function isOnboardingDone(app: OnboardingApp): boolean {
  try {
    return localStorage.getItem(storageKey(app)) === "done";
  } catch {
    return false;
  }
}

/** Mark onboarding complete (finish or skip). Does not touch SIWE sessionStorage intent. */
export function markOnboardingDone(app: OnboardingApp): void {
  try {
    localStorage.setItem(storageKey(app), "done");
  } catch {
    // private mode / quota — UI may re-show; acceptable
  }
}
