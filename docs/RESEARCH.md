# Cargo Fit — Market, Safety, & Algorithmic Research Report

**Date of Research:** 20 October 2026  
**Subject:** Competitive analysis, regulatory safety boundaries, 3D bin packing algorithms, and UX design benchmarks.

---

## 1. Competitive Analysis (Advertised Capabilities vs. Gaps)
*Note: Capabilities sourced from public product documentation and search summaries; classified as advertised, not independently audited.*

| Product | Supported Equipment | Key Advertised Features | Axle & Weight Modeling | Pricing & Access | Observed Operator Gaps |
|---|---|---|---|---|---|
| **EasyCargo** (`easycargo3d.com`) | Trucks, semi-trailers, containers | Up to 10k items, 250 item types; priority groups for multi-stop; non-stackable & tilt rules; 3D browser view; Excel import/export | Built-in axle calculation with weight distribution graphs | ~\$79/user/month or \$799/yr; 10-day trial | Opaque solver timeout feedback; axle weights presented as authoritative without clear vehicle tare / bridge formula caveats. |
| **Goodloading** (`goodloading.com`) | Trailers, containers, vans, pallets | Mixed cargo including barrels/pipes; multi-drop sequencing; ERP/TMS API | Gross vehicle weight & per-axle estimation (PRO tier) | Free tier severely restricted (no custom dims); PRO ~€28/mo | Rigid separation of basic vs. pro features; web interface can feel cluttered with nested modal menus. |
| **Truck Packer** (`truckpacker.com`) | Semi-trailers, box trucks, containers | Case and container libraries (audio/visual road cases, boxes); 3D editor; crew pull sheets | "Weight visualization" only; defers axle & bridge formula to third-party tools | Pro ~\$28/mo (single container); Business tier custom | Geared heavily toward entertainment/staging rather than general industrial/chemical/retail freight. |
| **Cargo-Planner** (`cargo-planner.com`, BFC) | Sea, road, air ULD, rail, breakbulk | Stacking, center-of-gravity rules, discharge order, URL sharing | Advertises center-of-gravity constraints | Lite \$59/mo; Standard \$99/mo; Enterprise custom | Enterprise features locked behind custom sales calls; complex UI steepening first-time user onboarding. |

### Core Takeaways
- **The "87% Illusion":** Incumbents frequently market volume utilization as the headline KPI, which leads naive shippers to pack volume-dense items without realizing axle overload or door blockage.
- **Search vs. Proof:** Incumbents rarely distinguish between an algorithm timing out ("No solution found within 60s") and a mathematical impossibility (e.g. item height > door height). Cargo Fit explicitly separates these.

---

## 2. Regulatory & Safety Boundary: What Geometry Cannot Certify

### FMCSA (USA) — 49 CFR Part 393 Subpart I
1. **Working Load Limit (WLL) & Aggregate Force:** Under §393.106, the aggregate WLL of tiedowns must equal at least 50% of the weight of the cargo. Direct tiedowns count 50% of their rating; indirect (friction) tiedowns count 100%. A 3D spatial layout knows box coordinates, but knows nothing of strap anchor angles, chain ratings, or winch integrity.
2. **Tiedown Quantity Requirements:** Number of tiedowns is dictated by article length and mass (e.g. at least 2 tiedowns for items 5–10 ft, plus 1 per additional 10 ft or fraction thereof, unless blocked against a forward bulkhead).
3. **Condition & Verification:** Straps with tears or unmarked ratings carry zero or severely degraded capacity under §393.108.
4. **Bulkheads & Dunnage:** Void filling, air bags, and forward blocking require physical load-bearing bulkheads; a CAD-style bounding box does not model friction coefficients or cargo shifting under 0.8g forward deceleration.

### NHVR (Australia) — Load Restraint Guide & Axle Distribution
1. **Axle-Group Legal Limits (GML/CML/HML):** A vehicle may be within Gross Vehicle Mass (GVM) yet incur severe statutory penalties if a steer, tandem, or tri-axle group exceeds its statutory rating.
2. **Steer-Axle Traction & Dynamic Stability:** Inadequate weight on the steer axle (typically below 20% of GVM) causes loss of directional control under braking. Conversely, excessive front bias causes suspension bottoming.
3. **Multi-Drop Dynamic Risk:** When Stop 1 is unloaded from the rear, the remaining cargo can shift the center of gravity forward or rearward, making an initially compliant vehicle suddenly illegal for the remainder of the journey.

**Rule for Cargo Fit:** All generated plans and exports must carry the explicit disclaimer:
> *"Geometric plan only. It is not an axle-compliance, securement, or road-safety certificate. Official scale measurements and qualified loading personnel override modeled assumptions."*

---

## 3. Algorithmic Architecture & Selection

### Options Evaluated
1. **Mixed-Integer Linear Programming / CP-SAT (e.g. Google OR-Tools):**
   - *Pros:* Can theoretically prove optimal solutions or infeasibility under complex constraints.
   - *Cons:* 3D non-overlapping placement with rotations is NP-hard. CP-SAT with `NoOverlap2D/3D` scales poorly past 40–50 heterogeneous boxes in practical interactive web response times (< 2 seconds), and compiling OR-Tools to WASM incurs heavy bundle overhead (> 15MB).
2. **Genetic / Simulated Annealing Heuristics:**
   - *Pros:* Flexible objective functions.
   - *Cons:* Nondeterministic without careful seeding; difficult to reproduce identical outputs across machines.
3. **Extreme-Point Heuristics (Crainic, Perboli, Tadei, 2008):**
   - *Mechanism:* Places boxes at candidate coordinate points projected along the axes from previously placed boxes. Evaluates candidate points using multi-criteria ranking (front-first, floor-first, volume-descending, footprint-descending, etc.).
   - *Implementation in Cargo Fit:* Pure TypeScript running in a dedicated Web Worker. Seeded pseudo-random generator (`mulberry32`) ensures exact determinism. Spatial grid cell indexing (`CELL = 250mm`) accelerates candidate queries from $O(N^2)$ to sub-millisecond per item.
   - *Independent Verification:* A separate `validator.ts` verifies non-overlap, interior bounding box, rotation rules, doorway cross-section, base gravity support, and no-stack rules.

---

## 4. Equipment Dimensions (Reference Standard)
*Derived from ISO 668 / 1496 and commercial dry van manufacturer specifications (editable presets in Cargo Fit).*

| Equipment Profile | Internal Dimensions (L × W × H) | Door Opening (W × H) | Declared Payload |
|---|---|---|---|
| **20 ft Dry ISO Container** | 5,898 × 2,352 × 2,393 mm (19'4" × 7'8.5" × 7'10") | 2,340 × 2,280 mm (7'8" × 7'6") | 28,000 kg (61,730 lb) |
| **40 ft Dry ISO Container** | 12,024 × 2,352 × 2,393 mm (39'5" × 7'8.5" × 7'10") | 2,340 × 2,280 mm (7'8" × 7'6") | 26,500 kg (58,420 lb) |
| **53 ft High-Cube Dry Van** | 15,980 × 2,530 × 2,790 mm (52'5" × 99.5" × 109.8") | 2,490 × 2,690 mm (98.0" × 106.0") | 19,500 kg (43,000 lb) |
| **7.5 t Box Truck (Regional)** | 4,200 × 2,050 × 2,200 mm | 2,000 × 2,100 mm | 2,500 kg (5,510 lb) |
| **Mid-size Cargo Van (L2H2)** | 3,100 × 1,700 × 1,400 mm | 1,250 × 1,250 mm | 1,000 kg (2,200 lb) |

---

## 5. Design & Interaction References
- **Linear (`linear.app`):** High information density, subtle OKLCH neutral palette, persistent status indicators, keyboard-accessible operations.
- **Figma / Spline (`spline.design`):** Canvas with inspectable object properties panel, real-time spatial manipulation, coordinate readouts.
- **Vercel Geist (`vercel.com`):** Monospace numerical precision, dual-unit disclosures, high contrast table hierarchy.

---

## 6. Interactive Spatial Rotation, Allowed Orientations & Stability Mechanics

### 6.1 Rotation Rules & Degrees of Freedom
In freight transport, items cannot be flipped arbitrarily. Physical orientation policies are dictated by internal contents, labeling (e.g. "THIS SIDE UP"), structural box fluting, and pallet skid bases:
1. **Fixed (`none` / 1 orientation):** Item must be loaded exactly as entered $[L, W, H]$. Critical for machinery with top exhaust/fluid reservoirs, upright appliances (refrigerators), and fragile glassware.
2. **Upright (`yaw_only` / 2 orientations):** Item may be rotated $90^\circ$ around the vertical $Z$ axis (yaw): $[L, W, H]$ and $[W, L, H]$. Height remains vertical. This is standard for EUR pallets ($1200 \times 800$ mm) and ISO pallets ($1200 \times 1000$ mm) loaded two-wide or pinwheeled to fill trailer widths ($2450$ mm).
3. **Any (`any` / 6 permutations):** Symmetrical sturdy boxes, uniform cartons, or soft parcels that may rest on any of their 6 faces: $[L, W, H]$, $[W, L, H]$, $[L, H, W]$, $[H, L, W]$, $[W, H, L]$, $[H, W, L]$.

### 6.2 Base Support & Gravity Thresholds
Under real road vibration (typically $0.2g$–$0.5g$ vertical acceleration, ASTM D4169), an item resting partially on another item will tip or crush corners if overhang is excessive:
- **100% Support Policy:** Conservative standard; requires the entire base footprint of an elevated item to be supported by solid surfaces (floor or stack tops).
- **80% Support Policy:** Industry standard for interlocking carton layers; allows up to 20% bridging over internal air gaps between pallets.
- **No-Stack Surface Enforcement:** Items flagged as `stackable: false` cannot bear weight on their top face, preventing crushing of delicate goods or pyramid-shaped pallet tops.

---

## 7. Multi-Strategy Fit Exploration: The Search for the "Best Way to Fit"

There is no single "best" load plan because conflicting operational objectives exist:
1. **The Maximum-Volume / Tightest Packing Goal:**
   - *Heuristic:* Sort by volume descending or longest edge descending; pack using front-first corner coordinates.
   - *Advantage:* Minimizes overall length consumed, leaving contiguous space near the rear door for future cargo.
   - *Trade-off:* May create top-heavy stacks or mix drop stops indiscriminately.
2. **The Low Center-of-Gravity (Low-COG) / Heavy-First Goal:**
   - *Heuristic:* Sort by weight descending; pack using floor-first placement. Dense cargo ($> 500\text{ kg/m}^3$) is forced to the floor bed, and lighter cargo sits on top.
   - *Advantage:* Maximizes roll stability on highway curves; reduces tip-over risk during sudden avoidance maneuvers.
   - *Trade-off:* May leave voids under high-density machinery that cannot support other boxes.
3. **The Multi-Stop / Reverse-Drop (FIFO) Goal:**
   - *Heuristic:* Sort by delivery stop order descending (Stop 3 first, Stop 2 second, Stop 1 last near the rear door).
   - *Advantage:* Cargo for Stop 1 is immediately accessible without double-handling or staging freight on a dock.
   - *Trade-off:* Can reduce overall volumetric density by up to 10–15% compared to pure geometric nesting.

Cargo Fit presents these alternative heuristics side-by-side in the **Arrangement Strategy Switcher**, displaying placed counts, remaining length, and center-of-gravity metrics for each candidate so the logistics planner can select the appropriate operational compromise.

---

## 8. Door Bottleneck & Cargo Ingress Dynamics

A frequent real-world failure mode is cargo that geometrically fits inside the trailer bay ($W_{item} \le W_{trailer}$ and $H_{item} \le H_{trailer}$) but cannot pass through the rear door frame:
- Dry van roll-up doors often reduce effective vertical aperture by 75–125 mm (3–5 in) compared to swing doors.
- High-cube trailers with interior height of 2,790 mm typically have door openings of 2,690 mm (a 100 mm bottleneck header).
- Refrigerated (reefer) trailers have thicker insulated sidewalls and door gaskets, reducing door width by 100–150 mm.

Cargo Fit models door width and door height independently from interior space, rendering warning highlights and explicitly flagging `DOOR_BOTTLENECK` violations before the truck arrives at the loading bay.

---

## 9. Axle Load Mechanics & The Federal Bridge Formula

While pure geometric bin packing models boxes in a static 3D Cartesian box, heavy vehicle road operations are governed by axle group statutory limits:
- **US Federal Bridge Formula B:**
  $$W = 500 \left( \frac{L \cdot N}{N - 1} + 12N + 36 \right)$$
  Where $W$ is maximum gross weight, $L$ is distance between outer axles of any group, and $N$ is number of axles.
- **Static Moment Balance:**
  The forward/rear axle load distribution is determined by the longitudinal centroid $X_{CoG}$:
  $$F_{rear} = W_{total} \cdot \frac{X_{CoG} - X_{kingpin}}{L_{wheelbase}}$$
  Excessive weight placed ahead of the kingpin overloads the tractor drive tandem; excessive weight behind the trailer bogie overloads the trailer tandem and unweights the steer axle.
- **Cargo Fit Boundary:** Cargo Fit computes and displays the longitudinal centroid $X_{CoG}$ as an **informational metric** ($X\%$ of length), but strictly refuses to issue "DOT axle certified" claims because tire inflation, suspension air-bag equalization, slider bogie positioning, and fuel tank levels are unmodeled by static box geometry.
