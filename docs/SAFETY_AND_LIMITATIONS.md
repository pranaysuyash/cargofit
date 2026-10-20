# Cargo Fit — Safety & Physical Limitations Policy

**Date:** 20 October 2026  
**Document Classification:** Mandatory Product Policy & Risk Boundaries  

---

## 1. Foundational Premise: Geometry Is Not Physical Safety
A three-dimensional CAD-style or bin-packing algorithm proves that a collection of rectangular boxes can be arranged inside an interior bounding box without spatial intersection.

**It does NOT prove that:**
1. The cargo can safely travel at highway speeds without breaking tiedowns or shifting into walls.
2. The vehicle’s axle groups comply with statutory load distribution laws (such as US Bridge Formula B or Australian Heavy Vehicle National Law).
3. The load is stable against dynamic lateral acceleration (rollover risk in curves).
4. The cargo is physically ingressable through doors with a real forklift or crane.
5. Intermediate states during multi-stop deliveries remain balanced or legal.

---

## 2. Hard Language Boundaries in the Product
The following phrases are **strictly prohibited** across all UI labels, help tooltips, generated reports, and marketing copy:
- ❌ *"100% Safe"*
- ❌ *"DOT / FMCSA Certified"*
- ❌ *"Guaranteed Road-Legal"*
- ❌ *"Optimized Legal Axle Distribution"*

The permitted, truthful terminology is:
- ✅ *"Feasible under modeled constraints"*
- ✅ *"No violations found by independent geometric validator"*
- ✅ *"Geometric plan only — scales and qualified loading personnel override modeled assumptions"*
- ✅ *"Axle weights, securement devices, and handling clearances are NOT modeled"*

---

## 3. Explicit Checks Modeled vs. Unmodeled

### Checks Claimed & Modeled (Mechanically Enforced)
- **Interior Enclosure:** All boxes lie within declared internal Length, Width, and Height.
- **Pairwise Non-Overlap:** Discrete bounding boxes do not intersect.
- **Allowed Orientations:** Rotation limited by explicit per-item flags (`fixed`, `upright`, `any`).
- **Base Gravity Support:** Minimum threshold (default 100%) of an elevated item's base must sit on underlying boxes.
- **Fragile / No-Stack:** Nothing may be placed on top of items marked `stackable: false`.
- **Declared Entry Doorway:** Placed cross-section in its entry orientation must fit inside declared door width and height.
- **Declared Payload Limit:** Sum of known placed unit weights must not exceed declared vehicle payload.

### Critical Real-World Factors Explicitly NOT Modeled
1. **Load Restraint & Tiedowns:** Strap ratings (WLL), direct vs. indirect tie-downs, corner protectors, and friction mats.
2. **Dynamic Axle Load Sharing:** Requires vehicle tare mass, fifth-wheel kingpin placement, tractor wheelbase, and suspension articulation.
3. **Rollover Stability (Transverse & Vertical Center of Gravity):** Uniform density is assumed per box; actual internal cargo density distribution is unknown.
4. **Physical Ingress Path:** Forklift mast clearance, turning radius inside the body, and pallet jack rollability over flooring.
5. **Multi-Stop Unloading Access:** While loading order is numbered, intermediate axle re-distribution upon partial drop-off is not simulated.
