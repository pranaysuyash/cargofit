# Product 01 — Cargo Fit & 3D Load Optimization

## 1. Instruction Hierarchy & Governance
This directory governs Product 01 (Cargo Fit) of the TRUCKING platform.
Precedence:
1. `/Users/pranay/AGENTS.md`
2. `/Users/pranay/Projects/AGENTS.md`
3. `/Users/pranay/Projects/trucking/AGENTS.md`
4. This file (`products/product-01-cargo-fit/AGENTS.md`)
5. Local `OPERATING_DOCTRINE.md`

Compatibility symlinks (`CLAUDE.md`, `GEMINI.md`, `QWEN.md`) must point directly to this file.

---

## 2. Product Identity & Domain Boundary
- **Port:** `5173`
- **Focus:** 3D heuristic cargo packing, independent geometric validation, Federal Bridge Law axle distribution (steer, drive tandem, trailer tandem), FMCSA cargo securement (49 CFR § 393.102), VICS Bill of Lading (BOL), and EDI 204/214 document engine.
- **Tech Stack:** React 19, TypeScript, Three.js, Vite 7, Vitest 3.

---

## 3. Sovereign Verification Commands
```bash
npm test        # Run 42 Vitest tests
npm run build   # Typecheck and production bundle build
npm run dev     # Start local server on port 5173
```

---

## 4. Cross-Project Bridges
- **Produces:** Fit-to-Quote payloads to Product 02 (Freight Pricing · Port 5174).
- **Consumes:** Equipment specs from Product 04 (Asset Studio · Port 5176) and actual axle weights from Product 05 (Fleet Telematics · Port 5177).

---

## 5. Git & Mutation Policy
- Read-only inspection is permitted (`git status`, `git diff`, `git log`).
- Staging, commits, pushes, and branch changes require explicit user authorization.
