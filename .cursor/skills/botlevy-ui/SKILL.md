---
name: botlevy-ui
description: >-
  Botlevy cooker-ui and merchant-ui structure and React+Vite practices.
  Use when editing cooker-ui, merchant-ui, commerce-shared UI, onboarding,
  login/help overlays, or PWA-facing frontends.
---

# Botlevy UI (React + Vite + PWA)

## When to apply

Editing or reviewing:

- `cooker-ui/**`
- `merchant-ui/**`
- `packages/commerce-shared/**` UI/auth helpers used by those apps

## Folder layout

Keep pages thin; extract by concern:

```
src/
  pages/          # Compose hooks + components only
  components/     # Presentational UI
  hooks/          # Wagmi, session, mic, dashboard data (compose small hooks)
  lib/ or helpers/# Pure functions (lang, formatters)
  types/          # Shared TS types for the app
```

Named exports preferred. Follow existing Tailwind / CSS variables in each app — do not invent a new design system.

## File size limits

| | Soft target | Hard max |
|--|-------------|----------|
| `pages/`, `hooks/`, large `components/` | ≤ **300** lines | ≤ **400** lines |

- **500+ lines is a smell** — split before merging.
- Prefer composing small hooks over one god-hook.
- Shared refs (mic/session timing) may live in a thin compositor or tiny `*Refs` helper when PWA ASR requires sync.
- Pure helpers belong in `lib/`, not in hooks.

## React + Vite

- React 19 patterns already in repo; avoid unnecessary `useMemo`/`useCallback` unless matching existing code.
- Side effects and wallet/session logic live in hooks; components receive props and callbacks.
- Reuse `@botlevy-commerce/shared`: `useWalletSiweLogin`, `siweLogout`, `hasInjectedProvider`, onboarding storage, speech helpers, token helpers.
- Do not change wagmi connector config unless explicitly asked (`injected` + MetaMask deeplink).

## Onboarding + login help

- First-visit carousel: skip or finish → `localStorage` key `botlevy.onboarding.<app>.v1` = `done`.
- Never touch `sessionStorage` key `botlevy.siweIntent` (SIWE resume after MetaMask deeplink).
- Login **ⓘ** opens a help sheet (network + one-button login + PWA return), not a reset of onboarding.
- Overlays: fixed / full viewport, `100dvh`, safe-area padding, large tap targets, `aria-modal` / `aria-label` on info control.

## PWA (must not regress)

1. Installed PWA and browser share same-origin `localStorage` / `sessionStorage`.
2. After MetaMask app deeplink remount, auto-SIWE must still run when login intent is set and onboarding is already done.
3. Onboarding overlay sits above chrome until skip/finish; then header **Masuk dengan MetaMask** is usable.
4. Preserve cooker hands-free mic / TTS behavior (do not hold `getUserMedia` open across ASR).
5. Do not break `vite-plugin-pwa` icon/manifest paths under `public/icons/`.

## Checklist before finishing a UI change

- [ ] No new/edited `pages/` / `hooks/` / large `components/` file over **400** lines (prefer ≤300)
- [ ] One-click login + deeplink resume still intact
- [ ] Onboarding persistence uses `localStorage` only for done/skip
- [ ] Help copy mentions BSC Testnet **97** and return-to-PWA
- [ ] Touch targets usable on phone; safe-area respected on overlays
