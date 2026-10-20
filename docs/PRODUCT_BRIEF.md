# Cargo Fit (Product 01) — Product Brief

**Status:** Active product implementation (Demo-ready web foundation)  
**Date:** 20 October 2026  
**Product Identity:** Product 01 under the TRUCKING project — Cargo Fit & Load Planning.  

---

## 1. Executive Summary & Problem Space
Shippers, 3PL dispatchers, warehouse coordinators, and freight forwarders constantly face a critical operational question:
> **"Does this shipment actually fit inside our available truck, trailer, or container, and why?"**

Historically, operators have been forced to choose between two extremes:
1. **Rule-of-thumb guesswork & spreadsheets:** High risk of sending a truck that cannot be loaded, getting turned away at the dock, or failing door/weight restrictions.
2. **Opaque "3D Magic" SaaS:** Incumbents (such as EasyCargo, Goodloading) present a colored 3D rendering with an "87% volume utilization" claim, but hide whether individual constraints (doors, rotation, gravity/stacking, axle weight, regulatory limits) were verified, unmodeled, or simply timed out.

**Cargo Fit** provides **explainable cargo-to-equipment reasoning**:
- Answers whether cargo fits physically and under what explicit constraints.
- Shows exactly which bounds, doors, orientations, or payload thresholds caused a rejection.
- Transparently separates **modeled & verified geometry** from **unmodeled physical/legal constraints** (axle weight, FMCSA/NHVR tiedown rules, forklift ingress).

---

## 2. Target Buyer & Persona Hypotheses
*Note: Hypotheses to be verified through direct customer trials.*

1. **Primary Buyer / Operator:** Operations Planner & Freight Forwarder handling mixed LTL/FTL cargo, custom machinery, furniture, or project logistics with non-standard dimensions.
2. **Secondary User (Dock / Warehouse Lead):** Receives clear, verified placement plans (PDF/print/CSV) with 3D/isometric/plan views and loading sequence, reducing dock turnaround time and avoiding reloading.
3. **Tertiary User (Logistics Manager / 3PL Broker):** Evaluates equipment options (van vs. 7.5t box vs. 20ft container vs. 53ft trailer) to select the right vehicle before booking carrier capacity.

---

## 3. Product Boundary: What Is In vs. Out of Scope

### In Scope (Product 01 Core)
- **Manifest Intake & Normalization:** Robust CSV/TSV import and interactive tabular editing with field-level validation, multi-unit conversions (`mm`, `cm`, `m`, `in`, `ft` and `kg`, `lb`, `t`), and zero-invention policy for unknown values.
- **Equipment Profiles:** Modifiable internal dimensions, door openings, declared payloads, and user-provided or illustrative costs.
- **Deterministic Extreme-Point Solver:** Fast heuristic search in browser Web Worker with multi-strategy passes (volume, longest edge, footprint, weight, input order).
- **Independent Geometric Validator:** Complete separation of solver and validator. Checks bounds, non-overlap, rotation compliance, gravity/base support, fragile/no-stack flags, door cross-section, and declared payload.
- **5-Tier Honest Outcome Taxonomy:**
  - `FEASIBLE_UNDER_MODELED_CONSTRAINTS`
  - `PROVEN_INFEASIBLE_UNDER_MODELED_CONSTRAINTS`
  - `NOT_FOUND_WITHIN_SEARCH_BUDGET`
  - `INCOMPLETE_INPUT`
  - `NEEDS_PHYSICAL_REVIEW`
- **Spatial Exploration:** High-density Isometric (4-angle yaw), Top Plan, and Side Elevation vector views, loading sequence step slider/player, and real-time manual nudge/rotate with instant re-validation.
- **Durable Local Persistence & Exports:** Client-side revision storage with read-back verification, version diffing, and export formats: Standalone Printable HTML Report, JSON Plan file, and CSV Placements.

### Out of Scope (Explicitly Excluded / Deferred)
- Live freight quotes / automated carrier marketplace booking.
- Telematics, GPS, ELD / tachograph integrations.
- Automated DOT / FMCSA / NHVR legal certification (physical inspections, scales, and certified cargo securement override software).
- Dynamic route / multi-stop route optimization (discharge sequence is currently tracked as an informational load order).
