import type { SessionRole } from "./siwe";

const INTENT_KEY = "botlevy.siweIntent";

/** Persist login intent across MetaMask deeplink remounts (PWA / mobile Chrome). */
export function setSiweLoginIntent(role: SessionRole): void {
  try {
    sessionStorage.setItem(INTENT_KEY, role);
  } catch {
    // private mode / quota — ignore; desktop path still works in-handler
  }
}

export function getSiweLoginIntent(): SessionRole | null {
  try {
    const v = sessionStorage.getItem(INTENT_KEY);
    return v === "cooker" || v === "merchant" ? v : null;
  } catch {
    return null;
  }
}

export function clearSiweLoginIntent(): void {
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    // ignore
  }
}

export function hasSiweLoginIntent(role: SessionRole): boolean {
  return getSiweLoginIntent() === role;
}
