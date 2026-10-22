# Session Context

- Generated: 2026-10-22T10:09:55Z
- Project: `trucking/products/product-01-cargo-fit`
- Provider: `openai`
- Model: `text-embedding-3-small`
- Project collection: `projects_proj_trucking_products_product_01_cargo_fit`
- Shared collection: `projects_workspace_shared`

## Doctrine Family

- Canonical root: `/Users/pranay/Projects/agent-start/doctrines`
- Operating doctrine: `OPERATING_DOCTRINE.md` v8.2 (sha256 `e14bab7b1964d8b7…`) — always applies
- Project: `trucking/products/product-01-cargo-fit`
- Routing mechanism: agent-start doctrine-family router v1.1 (deterministic intent-signal model)
- Generated at: 2026-10-22T10:09:55Z
- Generator: agent-start lib/doctrine_family.py

Doctrine routing for this run (task intent not supplied; deferred):

| Doctrine | Version | Status | Reason |
|---|---:|---|---|
| Operating | 8.2 | selected | always active: cross-cutting control plane |
| Review | 1.3 | unknown | task intent not supplied at generation time; defer to Operating Doctrine section 16 routing |
| Exploration | 1.1 | unknown | task intent not supplied at generation time; defer to Operating Doctrine section 16 routing |
| Research | 1.0 | unknown | task intent not supplied at generation time; defer to Operating Doctrine section 16 routing |
| Architecture | 1.1 | unknown | task intent not supplied at generation time; defer to Operating Doctrine section 16 routing |
| Testing | 1.1 | unknown | task intent not supplied at generation time; defer to Operating Doctrine section 16 routing |
| Security / Privacy / Safety | 1.0 | unknown | task intent not supplied at generation time; defer to Operating Doctrine section 16 routing |
| Release Readiness | 1.0 | unknown | task intent not supplied at generation time; defer to Operating Doctrine section 16 routing |
| Documentation | 1.1 | unknown | task intent not supplied at generation time; defer to Operating Doctrine section 16 routing |
| Inquiry and Analysis | 1.0 | unknown | task intent not supplied at generation time; defer to Operating Doctrine section 16 routing |

No specialist doctrine was selected for this run. The Operating Doctrine routing table (section 16) governs if the task's mode changes; canonical specialist doctrines live at the root above.

## Project Doctrine Sync

- File: `/Users/pranay/Projects/trucking/products/product-01-cargo-fit/OPERATING_DOCTRINE.md`
- Sync status: `synced from /Users/pranay/Projects/agent-start/doctrines/OPERATING_DOCTRINE.md; legacy filenames archived or removed`
- Guidance: read the operating doctrine before implementation or review on this project.

## Project-Focused Retrieval

> NOTE: Project collection is temporarily locked by another index/search process; using shared workspace context for this run.

## Shared Cross-Project Retrieval

### Reusable Patterns
- Collection: `projects_workspace_shared`
- Query: `similar architecture patterns for trucking/products/product-01-cargo-fit`
_Fast mode (--skip-index): retrieval skipped to keep startup non-blocking. Run `/Users/pranay/Projects/agent-start --project trucking/products/product-01-cargo-fit` for full retrieval, or set `AGENT_START_SKIP_INDEX_RETRIEVE=1` if you want retrieval with skip-index._

### Process Templates
- Collection: `projects_workspace_shared`
- Query: `project management templates and workflows`
_Fast mode (--skip-index): retrieval skipped to keep startup non-blocking. Run `/Users/pranay/Projects/agent-start --project trucking/products/product-01-cargo-fit` for full retrieval, or set `AGENT_START_SKIP_INDEX_RETRIEVE=1` if you want retrieval with skip-index._

### Common Failure Modes
- Collection: `projects_workspace_shared`
- Query: `lessons learned mistakes retrospectives postmortems`
_Fast mode (--skip-index): retrieval skipped to keep startup non-blocking. Run `/Users/pranay/Projects/agent-start --project trucking/products/product-01-cargo-fit` for full retrieval, or set `AGENT_START_SKIP_INDEX_RETRIEVE=1` if you want retrieval with skip-index._

### System Learning Graph
- Collection: `projects_workspace_shared`
- Query: `knowledge graph memory learning feedback loops autoresearch semantic taste graph`
_Fast mode (--skip-index): retrieval skipped to keep startup non-blocking. Run `/Users/pranay/Projects/agent-start --project trucking/products/product-01-cargo-fit` for full retrieval, or set `AGENT_START_SKIP_INDEX_RETRIEVE=1` if you want retrieval with skip-index._


---
## Agent Collaboration Style

Pranay expects the agent to act as a genuine technical collaborator, not an instruction executor:
- Have and express opinions on design, naming, logic, test quality
- Push back when something is wrong - don't just flag it, fix it with a rationale
- Catch bugs proactively without waiting to be asked
- Discuss tradeoffs directly: here is why X is wrong and Y is better
- The goal is two engineers reviewing each other's work, not a contractor following a spec

This applies to code review, test quality, naming, architecture boundaries, commit grouping strategy, and anything that would affect the project long-term.
