# Cargo Fit (Product 01) — Cargo Fit & Load Planning

> **Explainable cargo-to-equipment decision support for mixed freight.**  
> Know whether cargo fits available trucks, trailers, or containers, see why, and export verified loading plans.

---

## 1. Product Identity & Purpose
**Cargo Fit** is **Product 01** under the broader **TRUCKING** project. It is an independent, demo-ready, local-first web product built to help operational users (dispatchers, shippers, 3PL coordinators, warehouse supervisors):
- **Live Production URL:** [https://cargofit.pages.dev](https://cargofit.pages.dev) (Hosted on Cloudflare Pages)
- **GitHub Repository:** [https://github.com/pranaysuyash/cargofit](https://github.com/pranaysuyash/cargofit)

1. **Intake & Repair Manifests:** Import messy CSV/TSV manifests or multi-sheet Excel `.xlsx` workbooks with strict field-level validation and zero-guessing of missing values.
2. **Compare Equipment Honestly:** Evaluate candidate vehicles (vans, box trucks, ISO sea containers, 53ft dry vans) against explicit modeled constraints with multi-vehicle Fleet Allocation recommendations.
3. **Understand Rejections:** If an option fails, see the exact cause (item exceeds interior, door opening too small, rotation prohibited, payload exceeded) rather than a vague percentage.
4. **Inspect & Adjust Spatial Plans:** View orthographic Top, Side, and 4-yaw Isometric vector plans with step-by-step loading sequence, radial exploded assembly, longitudinal cutaway, and instant re-validation.
5. **Driver Work Orders & Multi-Stop Delivery:** Generate official printable Loading Work Orders with physical checkboxes, verify US Federal Bridge Formula B axle compliance, and simulate multi-stop LIFO unloads.
6. **Durable Local Persistence & Exports:** Save versioned revisions in the browser with read-back verification, and export standalone interactive 3D HTML reports, JSON plans, and CSV placements.

---

## 2. Quick Start & Local Execution

### Requirements
- **Node.js:** v18+ (tested on Node v24.13.0)
- **Package Manager:** `npm` v9+

### Commands
```bash
# Navigate to the Product 01 directory
cd products/product-01-cargo-fit

# Install dependencies (React 19, TypeScript 5.6, Vite 7, Vitest 3)
npm install

# Start local development server (launches on http://localhost:5173)
npm run dev

# Run full test suite (23 deterministic unit, integration, and performance tests)
npm run test

# Typecheck and create production build
npm run build

# Deploy directly to Cloudflare Pages (cargofit.pages.dev)
npm run deploy
```

---

## 3. Directory Layout
```
products/product-01-cargo-fit/
├── docs/
│   ├── PRODUCT_BRIEF.md         # Product scope, buyer personas, outcomes
│   ├── RESEARCH.md              # Competitor analysis, FMCSA/NHVR safety rules, algorithms
│   ├── DESIGN_DECISIONS.md      # Art direction, OKLCH palette, vector rendering rationale
│   ├── DATA_AND_CONSTRAINTS.md  # Contracts, units, rotation rules, outcome taxonomy
│   ├── SAFETY_AND_LIMITATIONS.md# Hard physical boundary: what geometry cannot certify
│   ├── TESTING.md               # Evidence tiers (T1–T4), S0–S3 sensitivity, benchmarks
│   ├── DECISION_LOG.md          # Architectural Decision Records (ADR-01 to ADR-05)
│   ├── OPEN_QUESTIONS.md        # Open operator questions & future opportunity map
│   └── COUNCIL_REVIEW.md        # Multi-perspective stakeholder critique
├── fixtures/
│   ├── mixed-regional-delivery.csv # Multi-unit commercial freight (pallets, crates, cartons)
│   ├── heavy-low-volume.csv        # Payload-constrained industrial freight
│   ├── oversized-and-rotation.csv  # Rotation-sensitive tall/awkward items
│   ├── messy-import.csv            # Manifest with typos/negatives for repair workflow
│   └── equipment-presets.json      # Illustrative container and vehicle profiles
├── src/
│   ├── engine/                  # Pure TypeScript domain & computation logic
│   │   ├── types.ts             # Typed data contracts & outcome taxonomy
│   │   ├── units.ts             # Metric/imperial conversion & formatting
│   │   ├── normalize.ts         # Validation & unit expansion
│   │   ├── csv.ts               # RFC-4180 CSV parser & serializer
│   │   ├── validator.ts         # Isolated geometric & constraint validator
│   │   ├── solver.ts            # Deterministic seeded Extreme-Point heuristic
│   │   ├── analyze.ts           # Sound bounds, metric computation, check states
│   │   ├── scenario.ts          # Hash calculation, diffing, what-if orchestration
│   │   ├── viz.ts               # Functional SVG rendering (Top, Side, Iso)
│   │   ├── report.ts            # Self-contained printable HTML & JSON plan builder
│   │   ├── storage.ts           # LocalStorage revisions with read-back verification
│   │   └── worker.ts            # Web Worker background solve thread
│   ├── ui/                      # React UI components
│   │   ├── App.tsx              # Workspace shell, step router, stale/unsaved guards
│   │   ├── Landing.tsx          # Marketing entry with live-computed sample hero graphic
│   │   ├── CargoStep.tsx        # Step 01: Table editor, CSV dropzone, repair list
│   │   ├── EquipmentStep.tsx    # Step 02: Space dimensions, payload, door, costs
│   │   ├── DecisionStep.tsx     # Step 03: Multi-vehicle comparison, ranking, what-if
│   │   ├── PlanStep.tsx         # Step 04: Vector visualizer, sequence player, manual nudge
│   │   ├── VersionsStep.tsx     # Step 05: Local revisions, HTML/JSON/CSV export
│   │   ├── common.tsx           # Status badges, numeric inputs, file downloaders
│   │   ├── samples.ts           # Bundled demo fixtures
│   │   └── useSolver.ts         # Web Worker lifecycle & cancellation hook
│   ├── main.tsx                 # Application entrypoint
│   └── styles.css               # Bespoke OKLCH styling & responsive layout
├── tests/
│   ├── engine.test.ts           # Vitest suite (23 unit, integration, and stress tests)
│   └── env.d.ts                 # Test environment declarations
├── index.html                   # HTML entry with font preconnects
├── package.json                 # Project dependencies & scripts
├── tsconfig.json                # TypeScript strict configuration
└── vite.config.ts               # Vite & Vitest configuration
```

---

## 4. Key Workflows to Exercise

### A. The 60-Second Walkthrough
1. **Landing Page:** Open `http://localhost:5173/`. Notice the hero figure: it is not a mockup; it is the real SVG output computed in-memory by the engine during page load.
2. **Open Sample Job:** Click **"Open the sample job →"**. Lands on **Step 01: Cargo**, populated with 35 physical units of mixed freight (Euro pallets, US GMA pallet in inches/lbs, shelving, cartons, and display crates).
3. **Compare Equipment:** Click **"Next: equipment →"** and then **"Next: compare options →"**. See the multi-equipment matrix:
   - *Cargo van:* `Does not fit (proven)` — Payload exceeded by 1,326 kg and volume exceeded.
   - *Storage box with narrow door:* `Does not fit (proven)` — Display glass crate cross-section exceeds the 1,000mm door width.
   - *20 ft Dry Container:* `Fits (modeled)` — 35/35 units placed with 0 validator violations.
   - *7.5 t Box Truck:* `Fits (modeled)` — 35/35 units packed.
4. **Inspect the Plan:** Click **"Open plan"** on the 20ft container or 7.5t box truck.
   - Toggle between **Isometric**, **Top plan**, and **Side elevation**.
   - Use the **Load sequence** player or slider to watch items packed step by step.
   - Select any box (e.g. #1 Euro Pallet), use the nudge buttons or arrow keys to move it, or press `R` to rotate. Notice the **Validator** panel immediately re-checks the placement and flags collisions in red.
5. **What-If Analysis:** Return to **Step 03**, click **"Pin as baseline"**, change the quantity or rotation rule of an item, and observe the live side-by-side delta showing exactly which vehicle status flipped and why.
6. **Save & Export:** Navigate to **Step 05**:
   - Save a named revision to the browser (read-back verified).
   - Click **"Open report to print/PDF"** to inspect the clean, self-contained printable report complete with high-resolution vector diagrams and explicit limitations.
