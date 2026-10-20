# Cargo Fit — Data Contracts, Units, & Constraints

**Date:** 20 October 2026  
**Subject:** Typed schema contracts, unit conversions, validation rules, and outcome classifications.

---

## 1. Domain Entities & Units

### Normalization Standard
All internal geometric calculations, placement coordinates, and bounds checks are computed in **millimeters (`mm`)** and **kilograms (`kg`)**.
- **Length Units Supported:** `mm`, `cm`, `m`, `in` (25.4 mm), `ft` (304.8 mm). Dual-display shows both metric and imperial equivalents (e.g. `2,400 mm · 94.5 in`).
- **Mass Units Supported:** `kg`, `lb` (0.45359237 kg), `t` (1,000 kg).

### Zero-Invention Policy for Unknown Values
If an imported manifest omits an item's weight, dimensions, or quantity:
- The numeric value is parsed strictly as `null`.
- The product **never** estimates, LLM-guesses, or invents standard SKU weights.
- Missing dimensions block the solver with an explicit `DIM_MISSING` repair prompt.
- Unknown weights allow geometric solving but prevent certified payload compliance, transitioning the outcome to `INCOMPLETE_INPUT`.

---

## 2. Rotation Rules
1. **`fixed` (1 orientation):** Must be loaded exactly in the entered orientation $(L \times W \times H)$. Used for fragile glass racks, display crates, and machinery with sensitive oil sumps.
2. **`upright` (2 orientations):** May rotate only around the vertical yaw axis: $[L \times W \times H]$ or $[W \times L \times H]$. Height remains vertical. Default for standard pallets and "This Side Up" cartons.
3. **`any` (6 orientations):** Can be placed along any permutation of axes. Permitted for durable cartons, pipes, metal framing, and symmetrical goods.

---

## 3. Independent Validator Constraints Checked

The validator (`src/engine/validator.ts`) runs separately from the solver and enforces:
1. **`OUT_OF_BOUNDS`:** $0 \le x \le L - dx$, $0 \le y \le W - dy$, $0 \le z \le H - dz$ (within $\epsilon = 0.01\text{ mm}$).
2. **`OVERLAP`:** Axis-aligned bounding box intersection check between all pairs of placed units.
3. **`ORIENTATION_NOT_ALLOWED`:** Verifies that $[dx, dy, dz]$ matches the allowable set defined by the unit's `RotationRule`.
4. **`DOOR_BLOCKED`:** Checks whether the placed cross-section $[dy, dz]$ can pass through the declared doorway $[W_{\text{door}}, H_{\text{door}}]$ at the entry plane.
5. **`UNSUPPORTED`:** For any box elevated off the floor ($z > 0$), checks whether at least $\text{minSupportPct}$ (default 100%) of its bottom face area rests directly on the top faces of underlying boxes.
6. **`ON_NO_STACK_ITEM`:** Checks whether any box rests on top of an item marked `stackable: false` (fragile / no-stack).
7. **`PAYLOAD_EXCEEDED`:** Checks whether the sum of known placed unit weights exceeds the equipment's declared maximum payload.

---

## 4. Outcome Taxonomy (Truthful Decision Engine)

| Status | Exact Definition | Action for Operator |
|---|---|---|
| `FEASIBLE_UNDER_MODELED_CONSTRAINTS` | Every cargo item is placed with zero validator violations, all weights are known and within payload, and door fit is satisfied. | Plan is mathematically valid under the stated model. Proceed to operational/securement check. |
| `PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS` | A sound mathematical bound tripped (e.g. total volume > vehicle volume, total weight > payload, or single item dimension > interior/door). | Do not waste time trying other arrangements; choose larger equipment or split shipment. |
| `NOT_FOUND_WITHIN_SEARCH_BUDGET` | The heuristic exhausted its attempt/time budget without placing all items. | **Not proof of impossibility.** Operator can raise attempts, relax rotation rules, or adjust support thresholds. |
| `INCOMPLETE_INPUT` | Manifest has invalid cells (zeros, negatives, missing dimensions) OR geometry fits but unknown weights preclude payload checks. | Repair highlighted cells or weigh items at the dock. |
| `NEEDS_PHYSICAL_REVIEW` | Geometry fits, but the equipment profile lacks a declared payload or door opening size. | Enter vehicle plate/CSC payload or measure door opening. |
