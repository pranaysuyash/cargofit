# Unslop Audit: Product 01 (Cargo Fit & Load Planning)

Component: `products/product-01-cargo-fit` (Port 5173)
Date: 2026-11-11
Subrepo commit target: `products/product-01-cargo-fit` (`origin/main`)

## Scope and Design Intent

Cargo Fit is an explainable freight geometric load planner backed by an independent packing validator. The design target preserves its light industrial paper-and-ink daylight aesthetic while removing purple SaaS accents, broken grid containment around the shared suite bar, invisible white-on-cream input text, colliding status badges, emoji UI icons, bare catch blocks, broken manifest icon paths, and AI prose artifacts.

## Before Baseline

1. Typecheck, tests, and build passed prior to edits (`npm run typecheck`, `22` Vitest files with `134` tests, `vite build`).
2. `unslop_code_scan.py src` reported score `123` (`92` findings: `4` bug-class bare `catch {}` blocks across `src/ui/SuiteDock.tsx` and `src/ui/VersionsStep.tsx`, `27` medium emoji literals across modals, `src/ui/PlanStep.tsx`, and `src/engine/nmfcClassification.ts`, plus `61` low verbose identifier hits; `tests` had `0` bug-class findings).
3. `devibe_scan.py products/product-01-cargo-fit` reported vibe score `24` (`2` high `#818cf8` / `#8b5cf6` colors in `src/ui/SuiteDock.tsx` and `src/ui/DunnageAirbagModal.tsx`, `4` medium emojis, `3` medium neon glow `box-shadow` styles, `2` medium `999px` pill styles).
4. `unslop_text_scan.py README.md` scored `67` (`16` bold lead-ins, `5` em dashes, `4` horizontal rules); `index.html` scored `3` (`1` em dash in `<title>`).
5. Live Chrome visual and console inspection (`1440x900` desktop Landing, Workspace Step 01 `#/app/cargo`, Workspace Step 04 `#/app/plan`, and `390x844` mobile Landing) identified four defects:
   - `<SuiteDock>` was mounted inside `.shell`, collapsing the suite bar into column 1 (`224px` wide) and overflowing across the canvas.
   - `:root` `color-scheme: light dark` rendered `.topbar .name` input text as white-on-cream in dark system appearance.
   - Step 04 `.badge .glyph` used a fixed `18px` square circle, causing `INFEASIBLE` text to collide with `"Does not fit"`.
   - Chrome console logged a deprecated `apple-mobile-web-app-capable` meta tag warning and failed icon fetches for nonexistent `/icon-192.png` and `/icon-512.png` in `public/manifest.json`.

## Changes Applied

1. Bug-class and shell repairs: replaced `4` bare `catch {}` blocks in `src/ui/SuiteDock.tsx` and `src/ui/VersionsStep.tsx` with `console.warn` logs; removed missing icon entries from `public/manifest.json`; replaced `apple-mobile-web-app-capable` with `mobile-web-app-capable` in `index.html`; updated stale `All 6` product copy in `SuiteDock.tsx` to `CANONICAL_PRODUCTS.length`.
2. Layout, contrast, and icon fixes: moved `<SuiteDock currentProductId="product-01-cargo-fit" />` outside `<div className="shell">` in `src/ui/App.tsx`; pinned `:root` `color-scheme: light` and explicit `color: var(--ink)` on `.topbar .name` in `src/styles.css`; made `.badge .glyph` dynamically sized with rounded corners (`4px`) and relaxed `.chip` / `.badge` radius to `6px`; stripped neon glow shadows, `transition: all`, and `800`/`900` font weights; replaced purple `#818cf8` / `#8b5cf6` tokens with teal `#2dd4bf` / `#0d9488`; swapped emojis in `src/ui/PlanStep.tsx`, all six compliance/engineering modals, and `src/engine/nmfcClassification.ts` with SVG icons from `src/ui/icons.tsx` and plain text symbols.
3. Text cleanup: rewrote `README.md`, cleaned `<title>` in `index.html`, and removed UI em dashes in `src/ui/Landing.tsx`, `src/ui/CargoStep.tsx`, `src/ui/EquipmentStep.tsx`, `src/ui/DecisionStep.tsx`, `src/ui/PlanStep.tsx`, `src/ui/VersionsStep.tsx`, and `src/ui/samples.ts`.

## After Verification

| Check | Result |
| :--- | :--- |
| `npm --prefix products/product-01-cargo-fit run typecheck` | PASS |
| `npm --prefix products/product-01-cargo-fit test` | PASS (`22` files, `134` tests) |
| `npm --prefix products/product-01-cargo-fit run build` | PASS (`dist/assets/index-LpC03HyL.js` `643.11 kB`, `index-BIm7HiMi.css` `52.06 kB`) |
| `unslop_code_scan.py products/product-01-cargo-fit/src` | `0` high, `0` medium, `0` bug-class (`61` low identifiers) |
| `devibe_scan.py products/product-01-cargo-fit` | `0` findings, score `0` across `104` files |
| `unslop_text_scan.py README.md` / `index.html` | Score `0` / `0` |
| Chrome `1440x900` (`/` landing, `#/app/cargo`, `#/app/plan`) & `390x844` mobile | Verified full-width `SuiteDock`, high-contrast scenario input, clean `INFEASIBLE` badge spacing, monochrome SVG buttons, zero console errors/warnings |
