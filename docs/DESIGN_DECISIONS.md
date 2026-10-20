# Cargo Fit — Design Decisions & Exploration

**Date:** 20 October 2026  
**Subject:** Art direction, interaction models, rendering strategy, and state architecture.

---

## 1. Materially Different Design Directions Explored

### Direction A: Heavy WebGL / Three.js 3D Virtual Yard
- **Concept:** Full 3D perspective scene with orbit controls, realistic container textures, shadows, and loading dock environment.
- **Why Considered:** Visually impressive on landing pages; gives users a visceral sense of looking inside a physical trailer.
- **Why Rejected as Primary:**
  - **High Dependency & Bundle Weight:** React Three Fiber, Drei, and Three.js add > 600KB gzipped.
  - **Perspective Occlusion:** In realistic 3D perspective, boxes at the front of a 53ft trailer occlude boxes in the rear, making inspection of packing patterns difficult without complex clipping planes.
  - **Print & Export Failure:** WebGL canvases cannot be natively embedded into clean, vector-crisp standalone HTML/PDF reports without lossy raster capture.
  - **Accessibility & Mobile Fragility:** Orbit controls on touchscreens frequently conflict with vertical page scrolling and fail keyboard navigation standards.

### Direction B (Winner): Precision Technical Spatial Instrument (Pure Vector SVG + Orthographic & Isometric)
- **Concept:** A clean, data-dense technical instrument combining isometric projection (with 4-way rotatable yaw) alongside true orthographic Plan (Top) and Side Elevation views, paired with synchronized tabular placements.
- **Why Selected:**
  - **Deterministic Zero-Dependency Rendering:** Fast, pure functional SVG rendering with zero GPU memory leaks or WebGL context loss.
  - **Export Parity:** The exact same SVG renderer used in the live browser application is serialized verbatim into the standalone printable HTML report.
  - **Precision & Readability:** Isometric rendering allows instant visual correlation with the loading order numbers, while orthographic Top and Side views show clear dimensional bounds without perspective distortion.
  - **Interactivity & Nudge:** Direct mouse picking on SVG elements, keyboard arrow-key nudging (with customizable step sizes), and instantaneous re-validation by the independent validator.

---

## 2. Color System & Typography

### Perceptual Color Palette (OKLCH)
- **Paper & Background:** Warm, neutral off-white `oklch(0.972 0.008 85)` avoiding sterile clinical `#FFFFFF` glare while ensuring maximum contrast.
- **Ink & Typography:** Deep slate `oklch(0.25 0.03 255)` for primary text, paired with `oklch(0.50 0.02 255)` for secondary annotations.
- **Accents:** Rust-amber `oklch(0.60 0.19 40)` denoting the doorway boundary, active selections, and interactive focal points.
- **Outcome Status Colors:**
  - `ok`: Forest green `oklch(0.50 0.13 155)` — Fits under modeled constraints.
  - `no`: Crimson `oklch(0.50 0.20 27)` — Proven infeasible under modeled constraints.
  - `unk`: Amber `oklch(0.45 0.12 80)` — Not found within search budget.
  - `inc`: Violet `oklch(0.42 0.10 280)` — Incomplete input.
  - `rev`: Tangerine `oklch(0.45 0.13 55)` — Needs physical review.

### Typography
- **Primary Typeface:** `Instrument Sans` — modern geometric neo-grotesque with warm terminals, high legibility in dense forms and UI badges.
- **Numeric & Coordinate Typeface:** `JetBrains Mono` with tabular numerals (`tnum`) and slashed zeros for coordinates, mm/kg measurements, and loading order indices.

---

## 3. State Management & Lifecycle

```
[ Cargo Rows & Equipment Profiles ] 
                │
         (Debounced 400ms)
                ▼
     [ Scenario Hash (FNV-1a) ]
                │
                ├─── Stale Indicator (if input changes while solving)
                ▼
      [ Web Worker Solver ] (Seeded, Multi-pass Heuristic)
                │
                ├─── Cancel / Superseded Check (Request ID guard)
                ▼
    [ Candidate Placements ]
                │
                ▼
 [ Independent Geometric Validator ] (bounds, overlap, rotation, support, door)
                │
                ▼
     [ Equipment Result & 5-Tier Status ]
                │
                ▼
   [ UI: Comparison, Plan, SVG Views, Exports ]
```

### Stale Data Protection
- Any user edit recalculates a deterministic 32-bit FNV-1a hash of all active rows, profiles, and settings.
- If an asynchronous solve finishes with an older request ID or mismatching hash, the result is rejected, guaranteeing that stale calculations never overwrite active inputs.
- The UI visibly displays `Results stale` until the Web Worker posts the fresh output.
