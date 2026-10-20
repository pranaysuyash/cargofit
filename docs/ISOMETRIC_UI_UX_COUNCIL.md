# Cargo Fit — Isometric & Novel Spatial UI/UX Council Review

**Date:** 20 October 2026  
**Charter:** Convene a dedicated, multi-disciplinary council to evaluate, stress-test, and invent next-generation isometric 3D visualization and spatial interaction paradigms for Cargo Fit (`product-01-cargo-fit`).  
**Status:** Approved Architectural Doctrine & UI/UX Roadmap  

---

## 1. Executive Charter & Council Mandate

Cargo Fit's mission is to deliver explainable, legally defensible, and dock-ready cargo-to-equipment loading plans. While the underlying geometric engine (Extreme Point heuristic + seeded PRNG + independent validator) guarantees mathematical soundness, the **interface between human perception and 3D spatial packing is the ultimate failure point in freight operations**.

Standard logistics software fails users in one of two ways:
1. **The Sterile 2D Spreadsheet Trap:** Tables of coordinates `(x, y, z)` that require forklift drivers to mentally reconstruct complex 3D stacking arrangements.
2. **The Fragile 3D WebGL Toy Trap:** Heavy, laggy, 600KB+ perspective canvases with orbit controls that occlude inner freight, spin uncontrollably on mobile touchscreens, leak GPU context, and fail when printed on paper.

Cargo Fit pioneered **Direction B: Pure Vector SVG Isometric & Orthographic Technical Instrumentation**. This Council was convened to push that paradigm beyond basic wireframes into a world-class, unique, and tactile spatial instrument.

---

## 2. Council Composition & Persona Dossiers

The Council brings together five adversarial, deep-domain specialist perspectives:

| Persona | Title & Background | Core Lens & Stance |
| :--- | :--- | :--- |
| **Dr. Aris Thorne** | **Isometric Game Engine & Technical Art Director**<br>*(Ex-lead graphics engineer on isometric tactical sims and precision CAD tools)* | Mathematical projection purity, depth sorting, topological ordering, occlusion mitigation, micro-bevels, and anti-aliased vector lighting. |
| **Elena Rostova** | **Industrial Dock Ergonomist & Field Terminal UX Lead**<br>*(15 years designing rugged terminal UIs for maritime ports and rail freight yards)* | Glove/grease touch targets, sunlight-readable high-contrast palettes, glanceable 200ms cognitive parsing, and vibration-resilient mobile layouts. |
| **Kaelen Voss** | **Tactile Kinetic Interaction & Micro-Motion Designer**<br>*(Pioneer in physics-grounded direct manipulation and spatial interface design)* | Direct isometric manipulation, magnetic snap vectors, spring resistance curves, spatial audio/visual collision pushback, and tactile feedback. |
| **Prof. Mira Chandrasekhar** | **Volumetric Telemetry & Information Architecture Specialist**<br>*(Author on dense multi-dimensional technical data visualization; Tufte tradition)* | Integrating non-geometric physical realities (Center of Gravity, axle load distributions, crush pressure gradients) into the spatial projection. |
| **Soren Lindqvist** | **Avant-Garde Systems Architect & Creative Technologist**<br>*(Creator of radical non-standard tool interfaces and generative spatial blueprints)* | Breaking the "dashboard" cliché. Inventing unified spatial canvases, dynamic exploded views, time-scrubbing ghost trails, and semantic zoom. |

---

## 3. Round 1: Critical Audit of the Current Isometric Engine

The Council began by examining the current implementation in `products/product-01-cargo-fit/src/engine/viz.ts` (`renderIso`, `renderCargo3D`, `renderEquipment3D`) and `src/ui/PlanStep.tsx`.

### Aris Thorne (Technical Art):
> *"The current `renderIso` is an admirable start: using a standard 30° isometric projection (`c30 = cos(π/6)`, `s30 = 0.5`) with 4 yaw angles (0°, 90°, 180°, 270°) and painter's depth sorting by rotated center coordinate. However, it suffers from two classic isometric flaws:*
> 1. *Isometric Ambiguity (Necker Cube Illusion): Without ambient occlusion, directional cast shadows, or face luminance differentiation, identical stacked cubes blend together into an illegible silhouette.*
> 2. *Center-Depth Sorting Failures: Sorting by `x + y` breaks on interlocking L-shaped or overhang configurations. You need topological sort or acyclic painter partitioning to prevent visual overlap glitching.*
> 
> *The top face is currently rendered with `fill-opacity="0.95"`, front-left with `0.85`, and front-right with `0.72`. That lighting formula is good, but without floor drop-shadows and chamfered edge highlights, the boxes feel weightless."*

### Elena Rostova (Dock Ergonomics):
> *"Look at this on a Panasonic Toughbook or Zebra TC58 handheld on an outdoor cross-dock in direct 12:00 PM sunlight. The text tags (`1200×800×1400`) at 10px in `JetBrains Mono` become unreadable gray smudges. The door entry marker `DOOR ENTRY →` in amber `oklch(0.62 0.19 40)` is drowned out.*
> 
> *Furthermore, a forklift driver doesn't pack an entire trailer at once. They pack unit #1, then #2, then #3. The loading sequence slider (`upTo`) is buried at the bottom. The sequence slider should be the hero element in 'Dock Execution Mode' with giant 64px tap targets for `PREVIOUS STEP` and `NEXT STEP`."*

### Kaelen Voss (Tactile Interaction):
> *"In `PlanStep.tsx`, if I want to adjust a box, I have to click it, look down at a coordinate form, click an input field, type `1200`, and press Enter. That completely severs the hand-eye spatial connection!*
> 
> *In an isometric view, when I select a box, I should see 3 tactile isometric handles (X length, Y width, Z elevation). Dragging along those 30° axes should smoothly slide the box along the floor or stack top, with magnetic snapping to adjacent pallets and instant red pushback if it penetrates another bounding box."*

### Mira Chandrasekhar (Volumetric Telemetry):
> *"You are rendering physical cargo as empty hollow blocks. In trucking, weight distribution kills companies and overturns rigs. 
> 
> *Where is the composite Center of Gravity (CoG)? Where is the axle envelope? If a carrier loads 20,000 kg of steel coils at the nose of a 53ft trailer, the tractor drive axles will exceed 34,000 lbs and get impounded at the first weigh station. The isometric view should project a live 3D CoG plumb-bob onto the trailer floor, with a green target zone indicating safe axle balance."*

### Soren Lindqvist (Avant-Garde Systems):
> *"Why are we constrained to a static isometric angle? Even with 4 yaw rotations, a 53ft trailer is 16.15 meters long and only 2.6 meters wide. It's a deep, narrow tunnel. When viewed from the door, the front nose pallets are occluded by dozens of pallets.*
> 
> *We need novel spatial interaction verbs:*
> - *`PEEL` (X-ray cross-sectional clipping plane).*
> - *`EXPLODE` (Volumetric spacing expansion slider).*
> - *`GHOST` (Dimming all non-focused SKU categories to glass-wireframe).*
> - *`BLUEPRINT MODE` (High-density technical blueprint aesthetic with dimension leader lines)."*

---

## 4. Deep Debates & Architectural Conclusions

### Debate 1: Vector SVG vs. WebGL vs. Hybrid Canvas
- **Dissent:** Soren pushed for a lightweight WebGL renderer with three.js or Babylon.js.
- **Counter-Argument (Aris & Elena):** WebGL fails zero-dependency constraints, breaks deterministic vector PDF/HTML printing, crashes in web workers, and consumes excessive battery on warehouse handhelds. Pure SVG is DOM-native, accessible via ARIA, scalable to infinite resolution, and trivially embeddable in printable standalone reports.
- **Council Verdict (Unanimous):** **Remain 100% pure vector SVG.** Enhance SVG with sophisticated vector techniques: SVG linear gradients for isometric bevels, directional drop-shadow filters, pattern hatches for hazardous/fragile cargo, and CSS hardware-accelerated transforms for smooth 60fps pan/zoom.

---

### Debate 2: Resolving the Deep-Tunnel Occlusion Problem (The 53ft Van Paradox)
- **Problem:** In a full 53ft dry van with 60 pallet positions, front rows completely block view of the interior and rear rows.
- **Council Innovations Adopted:**
  1. **Dynamic Longitudinal Cutaway (`X-Ray Slice`):** A dual-handled depth slider that slices the trailer along the X-axis (Door to Nose). Items beyond the cut plane fade to 10% opacity hairline wireframes, exposing the hidden interior structure.
  2. **Volumetric Exploded Assembly (`Explode Slider`):** An interactive slider from 0% to 100% that offsets placements radially from the center:
     $$\Delta x = \text{sign}(x - L/2) \cdot \delta_x, \quad \Delta y = \text{sign}(y - W/2) \cdot \delta_y, \quad \Delta z = z \cdot \delta_z$$
     This allows instant inspection of tight interlocking fits and bottom-layer crush points without losing spatial relationship.
  3. **Elevation Shadow Projections:** Elevated boxes cast an ambient shadow polygon on the floor grid with vertical dashed plumb-lines connecting the box corners to its floor footprint.

---

### Debate 3: Center of Gravity (CoG) & Axle Load Manifold
- **Council Formulation:** The isometric engine must calculate and project the composite Center of Gravity:
  $$\bar{X} = \frac{\sum m_i x_i}{\sum m_i}, \quad \bar{Y} = \frac{\sum m_i y_i}{\sum m_i}, \quad \bar{Z} = \frac{\sum m_i z_i}{\sum m_i}$$
- **Visual Representation:**
  - A glowing 3D crosshair marker in isometric space at $(\bar{X}, \bar{Y}, \bar{Z})$.
  - A vertical dashed plumb-line dropping to $(\bar{X}, \bar{Y}, 0)$ on the floor.
  - A target reticle on the floor showing the **Safe Loading Window** (typically 45%–55% of trailer length for standard tandem axle tractors).
  - Front steer, drive, and rear tandem axle indicator bars flanking the trailer bed with real-time percentage load bars (with clear disclaimers that axle weight distribution is an engineering estimate).

---

## 5. The Five Breakthrough UI/UX Paradigms

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ CARGO FIT ISOMETRIC WORKSPACE (Next-Gen Concept)                                                │
├─────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ ⛶ Fullscreen ] [ ↻ Yaw 0°/90°/180°/270° ] [ 💥 Explode: 25% ] [ ✂ Cutaway: X=12.4m ] [ ⚲ CoG ]  │
├───────────────────────────────────────────────────────┬─────────────────────────────────────────┤
│                                                       │ TACTICAL DOCK SEQUENCER (HUD)           │
│                    ISOMETRIC SCENE                    ├─────────────────────────────────────────┤
│                                                       │ STEP #14 of 42                          │
│               ▲ Z                                     │ ┌─────────────────────────────────────┐ │
│               │   ▲ Y (Width)                         │ │ PALLET #14: Industrial Pump Valv.   │ │
│               │  /                                    │ │ Dim: 1200 × 800 × 1450 mm           │ │
│               │ / 30°                                 │ │ Wt:  650 kg · Non-stackable         │ │
│               └──────► X (Length)                     │ └─────────────────────────────────────┘ │
│                                                       │ Position: X=4,800  Y=0  Z=0             │
│        ┌──────────────┐                               │ Orientation: LENGTHWISE [ R: Rotate ]  │
│       /              /│                               │ Status: ✓ SOUND SUPPORT & SECURED      │
│      ┌──────────────┐ │                               ├─────────────────────────────────────────┤
│      │              │ │  ◄ [Active Selected Unit]     │ [ ◀ PREV (J) ]      [ NEXT STEP (K) ▶ ] │
│      │   #14        │ │                               ├─────────────────────────────────────────┤
│      │              │/                                │ AXLE ESTIMATE & BALANCE                 │
│      └──────────────┘                                 │ Steer:  4,800 kg (Within Limit)        │
│             │                                         │ Drive: 14,200 kg [████████░░░] 82%      │
│             ▼ (Floor Shadow Plumb-line)               │ Tandem: 15,100 kg [█████████░░] 88%      │
│             ◌ (CoG Target Reticle)                    │ CoG: X = 7,850 mm (51.2% - Optimal)     │
├───────────────────────────────────────────────────────┴─────────────────────────────────────────┤
│ ◀◀ REWIND  [ ▶ PLAY SEQUENCE (Space) ]  [ STEP SLIDER: ━━━━━━━━●━━━━━━━━━━━━━━━━━━━━ ]  FAST ▶▶ │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Paradigm A: The "Tactical Dock HUD" (High-Glare, Big-Action Ergonomics)
- **Target User:** Forklift drivers and dock foremen holding muddy, glare-prone 8-inch tablets.
- **Key Features:**
  - **Single-Thumb Navigation:** Giant bottom-docked action bar (`PREV`, `STEP NUMBER`, `NEXT`) with haptic/click feedback.
  - **High-Contrast Sunlight Theme:** Ultra-high contrast monochrome baseline with stark amber and cobalt functional highlights (`oklch(0.98 0 0)` paper, `oklch(0.12 0 0)` charcoal ink, `oklch(0.65 0.22 45)` amber alerts).
  - **Spoken Audio / Tone Feedback:** (Optional) High-frequency chime on valid placement step; low double-tone warning if an item requires special handling (Hazmat / Non-stackable).

### Paradigm B: Dynamic Volumetric Exploded View (`Explode Mode`)
- **Interaction:** A smooth slider (`0%` to `100%`) or keypress `X`.
- **Behavior:**
  - Boxes expand away from the container center along their respective axes.
  - Dashed guide-wires connect each box back to its packed resting position.
  - Allows instant visual verification of interior cavities, orientation alignment, and bottom-layer pallet positions that would otherwise be 100% occluded.

### Paradigm C: Isometric Axis-Snapping Direct Manipulation
- **Interaction:**
  - Clicking/tapping a placed box reveals an **Isometric Triad Gizmo** (3 colored arrows along $30^\circ$ length, $150^\circ$ width, and $90^\circ$ height).
  - Dragging an arrow constrains movement to that physical axis.
  - **Magnetic Surface Snapping:** Moving a box near the floor ($Z=0$), the trailer front wall ($X=0$), or the top surface of another box snaps it cleanly into contact with visual magnetic pulse cues.
  - **Live Collision Re-Validation:** If dragged into an intersecting or un-supported coordinate, the box instantly flashes translucent crimson with a sound rejection badge, preventing illegal placements in real time.

### Paradigm D: Multi-Layer Telemetry Manifold (CoG & Crush Heatmap)
- **Crush Pressure Shading:** An overlay toggle that colors boxes by the cumulative weight resting on top of them:
  - Green: Low load ($< 200\text{ kg}$ on top).
  - Yellow: Moderate load ($200\text{--}800\text{ kg}$).
  - Red: Approaching cargo crush tolerance ($> 800\text{ kg}$).
- **CoG Vector Plum:** Real-time 3D crosshair showing longitudinal and lateral center of mass relative to trailer wheelbase.

### Paradigm E: Unified Semantic Blueprint View
- **Concept:** A toggle from "Artistic Solid Shading" to "Technical Blueprint Mode".
- **Visuals:** Dark Prussian blueprint background (`oklch(0.22 0.06 250)`), luminous cyan wireframes (`oklch(0.85 0.15 210)`), white dimension callouts with leader lines, and hatched wall cross-sections.
- **Purpose:** Ideal for formal engineering submittals, permitting packages, and aerospace/military freight documentation.

---

## 6. Mathematical Formulations for Next-Gen SVG Isometric Engine

### 1. Unified 30° Axonometric Projection Matrix
For coordinates $(x, y, z)$ in trailer space (where $x \in [0, L]$, $y \in [0, W]$, $z \in [0, H]$):
With yaw angle $\theta \in \{0, \frac{\pi}{2}, \pi, \frac{3\pi}{2}\}$:
$$\begin{bmatrix} x_r \\ y_r \end{bmatrix} = \mathbf{R}(\theta) \begin{bmatrix} x - L/2 \\ y - W/2 \end{bmatrix} + \begin{bmatrix} L_r/2 \\ W_r/2 \end{bmatrix}$$

Then project to screen canvas coordinates $(u, v)$:
$$u = u_0 + (x_r - y_r) \cdot \cos(30^\circ) \cdot s$$
$$v = v_0 + (x_r + y_r) \cdot \sin(30^\circ) \cdot s - z \cdot s$$
Where $\cos(30^\circ) = \frac{\sqrt{3}}{2} \approx 0.866025$, $\sin(30^\circ) = 0.5$, and $s$ is the pixels-per-millimeter scale factor.

### 2. Depth Sort Function with Topological Tie-Breaking
Depth value for painter's algorithm:
$$\text{Depth}(p) = x_r(p) + y_r(p) + \epsilon \cdot z(p)$$
For strict non-occlusion, boxes are partitioned into dependency DAG (Directed Acyclic Graph) where box $B$ depends on box $A$ if $B$ is physically in front of or on top of $A$ in the camera projection ray.

### 3. Radial Exploded Vector
Given expansion ratio $\kappa \in [0, 1]$:
$$x' = x + \kappa \cdot \left(\frac{x - L/2}{L/2}\right) \cdot \text{MaxOffset}_x$$
$$y' = y + \kappa \cdot \left(\frac{y - W/2}{W/2}\right) \cdot \text{MaxOffset}_y$$
$$z' = z + \kappa \cdot z \cdot \text{MaxOffset}_z$$

---

## 7. Implementation Roadmap & Phasing

| Phase | Milestone | Scope & Deliverables | Target Timeline |
| :--- | :--- | :--- | :--- |
| **P0** *(Immediate)* | **Visual Legibility & Depth Overhaul** | Directional face shading, floor drop-shadow polygons, chamfered corner highlights, and high-contrast font size increases in `viz.ts`. | Week 1 |
| **P1** *(Short-term)* | **Dynamic Longitudinal Cutaway & Explode** | Add `sliceX` depth clipping slider and `explode` slider to `VizCtx` and `PlanStep.tsx`. | Weeks 2–3 |
| **P2** *(Mid-term)* | **Tactile Dock HUD & Keyboard Sequencer** | Fullscreen Dock Mode with giant step buttons, keyboard step navigation (`J`/`K`), and floor CoG plumb-bob overlay. | Weeks 3–4 |
| **P3** *(Advanced)* | **Direct Isometric Manipulation** | On-canvas isometric gizmo handles for drag-nudging items with magnetic surface snapping and live collision feedback. | Weeks 5–6 |

---

## 8. Dissenting Opinions & Unresolved Tensions

1. **Dissent on Direct Drag Manipulation (Elena Rostova):**
   - *Argument:* "Warehouse loaders wearing heavy leather or nitrile gloves will trigger accidental drags on touchscreens. Manual dragging should be disabled by default on touch devices, requiring an explicit 'Unlock Manual Nudge' toggle."
   - *Council Resolution:* Adopted. Direct drag gizmo is locked behind an explicit `Edit Position` button; on mobile/tablets, step-by-step nudging uses discrete 100mm/10mm directional arrows.

2. **Dissent on Color Themes (Soren Lindqvist vs. Mira Chandrasekhar):**
   - *Argument:* Soren advocated for full-time dark-mode cyberpunk neon styling. Mira dissented, noting that industrial logistics printers produce unreadable ink-soaked black pages when dark mode is sent to paper.
   - *Council Resolution:* The live canvas supports Dark Tactical and Luminous Blueprint modes, but **all export and print functions strictly enforce high-contrast daylight paper monochrome/slate**.

---

## 9. Council Sign-Off & Approvals

- **Dr. Aris Thorne** — *Approved with topological sort addendum.*
- **Elena Rostova** — *Approved with glove-safety lock requirement.*
- **Kaelen Voss** — *Approved with spring-curve snap kinematics.*
- **Prof. Mira Chandrasekhar** — *Approved with mandatory legal CoG disclaimers.*
- **Soren Lindqvist** — *Approved with blueprint styling inclusion.*
