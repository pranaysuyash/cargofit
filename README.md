# Cargo Fit (Product 01): Cargo Fit and Load Planning

Cargo Fit is an explainable cargo-to-equipment decision-support tool built with React, TypeScript, and Vite for logistics dispatchers, warehouse managers, and load planners.

## Resources

- Live URL: [https://cargofit.pages.dev](https://cargofit.pages.dev) (Cloudflare Pages)
- GitHub Repository: [https://github.com/pranaysuyash/cargofit](https://github.com/pranaysuyash/cargofit)

## Core Capabilities

1. Intake and repair manifests: Import CSV, TSV, or multi-sheet Excel (`.xlsx`) workbooks with strict field-level validation and zero guessing of missing dimensions or weights.
2. Compare equipment cleanly: Evaluate candidate vehicles (vans, box trucks, ISO sea containers, 53-ft dry vans) against explicit modeled constraints with metric and imperial unit conversions.
3. Understand rejections: When an option fails, inspect the exact cause (item exceeds interior, door opening too small, rotation prohibited, payload exceeded) rather than a bare pass/fail badge.
4. Inspect and adjust spatial plans: View orthographic Top, Side, and 4-yaw Isometric vector plans with step-by-step loading sequence, radial exploded assembly, X-ray occlusion, interactive manual nudging/rotation, and re-validation.
5. Driver work orders and multi-stop delivery: Generate printable Loading Work Orders with physical checkboxes, estimate US Federal Bridge Formula B axle distribution and multi-stop CoG shifts, and model FMCSA tie-down requirements.
6. Local persistence and exports: Save versioned revisions in the browser with read-back verification, and export standalone interactive 3D HTML reports, work orders, JSON, or CSV.

## Local Setup

Requirements:

- Node.js v18+ (tested on Node v24.13.0)
- `npm` v9+

Installation and local development:

```bash
git clone https://github.com/pranaysuyash/cargofit.git
cd cargofit
npm install
npm run dev
```

Vite opens the local server on port 5173 (for example `http://localhost:5173/`).

## Build and Verification

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

## Example Verification Results (Mixed Regional Delivery)

With the bundled `Mixed regional delivery` fixture (35 cargo units across 6 SKUs, 2,489 kg total weight):

- Cargo van (`Does not fit (proven)`): Payload exceeded by 1,326 kg and volume exceeded.
- Storage box with narrow door (`Does not fit (proven)`): Display glass crate cross-section exceeds the 1,000 mm door width.
- 20 ft Dry Container (`Fits (modeled)`): 35/35 units placed with 0 validator violations.
- 7.5 t Box Truck (`Fits (modeled)`): 35/35 units packed.
