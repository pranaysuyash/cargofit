# Cargo Fit — Architectural Decision Log (ADRs)

---

### ADR-01: Independent Separation of Solver and Validator
- **Date:** 20 October 2026
- **Context:** Optimization heuristics (such as 3D bin packing) are complex and prone to subtle bugs or edge-case boundary breaches.
- **Decision:** The solver (`solver.ts`) never certifies its own correctness. An entirely independent geometric validator (`validator.ts`) inspects candidate plans using strictly isolated geometry checks (bounds, overlap, orientation, door, gravity support, fragile stacking, declared payload).
- **Consequences:** If a bug is ever introduced in a solver heuristic, candidate plans are rejected by the validator before reaching the operator.

---

### ADR-02: Extreme-Point Heuristic with Multi-Order Priority Passes
- **Date:** 20 October 2026
- **Context:** Needed in-browser, instantaneous solving without multi-megabyte WASM dependencies or slow CP-SAT solver compilation.
- **Decision:** Implemented deterministic Extreme Point heuristic (Crainic et al. 2008) in TypeScript with seeded PRNG (`mulberry32`). Evaluates candidates across distinct sorting heuristics (volume descending, longest edge descending, footprint descending, heavy-first, tallest-first, no-stack-first, and input order) combined with front-first and floor-first coordinate scoring.
- **Consequences:** Sub-second solve times for typical manifests (< 50 items) in a Web Worker, scaling to hundreds of items under 6 seconds.

---

### ADR-03: Zero-Invention Policy for Incomplete Manifest Data
- **Date:** 20 October 2026
- **Context:** Many modern software tools attempt to guess or hallucinate missing weights or dimensions using LLMs or static averages.
- **Decision:** Missing values are parsed strictly as `null`. Missing dimensions halt the solver with actionable field-level repair prompts. Missing weights permit geometric solving but classify the result as `INCOMPLETE_INPUT` rather than certifying payload compliance.
- **Consequences:** Ensures zero liability from ungrounded estimates and preserves operational integrity.

---

### ADR-04: SVG-First Technical Instrument over WebGL Canvas
- **Date:** 20 October 2026
- **Context:** Need to represent 3D placements visually while maintaining clean exports and universal device support.
- **Decision:** Built high-contrast SVG renderers supporting 4-yaw Isometric, Top Plan, and Side Elevation views.
- **Consequences:** Zero external 3D engine dependencies, instant serialization into printable HTML/PDF reports, keyboard accessible, and high performance on mobile devices.

---

### ADR-05: Local-First Revision Storage with Read-Back Verification
- **Date:** 20 October 2026
- **Context:** Users need versioned scenario management without mandatory SaaS login or backend database dependencies in early product phases.
- **Decision:** Scenario revisions and full solver results are persisted to `localStorage`. Every write performs an immediate read-back verification against the payload before the UI displays a "Saved" confirmation.
- **Consequences:** Safe, confidential client-side data retention. No silent data loss due to quota exhaustion.
