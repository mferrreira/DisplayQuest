# DisplayQuest Frontend Refactor — Constitution

This document establishes the immutable principles governing this refactor. Any decision violating these principles must be explicitly rejected.

## 1. Backend is the Domain Authority
- The backend (Prisma schema, modules, API contracts) is the single source of truth for domain logic.
- Frontend never duplicates domain rules (permissions, state machines, validation).
- Frontend contracts must mirror backend contracts exactly.

## 2. Spec-Driven Development
- No production code is written without a corresponding specification.
- Specifications live in `.spec/specs/` and are versioned with the code.
- Each spec defines: purpose, actors, preconditions, inputs, outputs, domain rules, API dependencies, UI behavior, state transitions, loading/error/empty states, accessibility, responsive behavior, acceptance criteria, test scenarios.

## 3. Test-First Implementation
- For every meaningful behavior: SPEC -> TEST -> IMPLEMENT -> VERIFY -> REFACTOR.
- Unit tests for pure logic; component tests for UI behavior; integration tests for API contracts; E2E tests for critical user flows.
- Tests encode behavior, not implementation details.

## 4. Architecture Boundaries
```
app/                    -> Next.js App Router pages & layouts (thin)
features/               -> Feature-scoped UI + logic (co-located)
entities/               -> Domain types & schemas (shared)
shared/                 -> Truly reusable UI primitives, hooks, utils
lib/                    -> Cross-cutting concerns (auth, API client, config)
```
- No cross-feature imports. Features communicate via shared contracts or events.
- Server/client boundary is explicit. Server components by default; client components only when necessary.

## 5. State Management Strategy
- **Server state**: TanStack Query (caching, invalidation, optimistic updates).
- **Client state**: Zustand for cross-feature ephemeral state; React Context only for genuinely global providers (auth, theme).
- **URL state**: nuqs for shareable, bookmarkable UI state (filters, pagination, tabs).
- No prop drilling beyond 2 levels. No context for server state.

## 6. Design System
- Single source of truth: Tailwind CSS v4 `@theme` directive + semantic tokens.
- No arbitrary colors, spacing, or radii. Everything references design tokens.
- Components built on Radix UI primitives via shadcn/ui patterns.
- Accessibility is non-negotiable (WCAG 2.1 AA minimum).

## 7. Quality Gates (Definition of Done)
A feature is complete only when ALL pass:
- [ ] Specification complete and reviewed
- [ ] Architecture consistent with constitution
- [ ] API contract verified against backend
- [ ] Implementation complete
- [ ] Unit/component tests passing
- [ ] Integration tests passing
- [ ] E2E behavior passing
- [ ] Accessibility reviewed (axe + manual)
- [ ] Responsive behavior reviewed (320px, 768px, 1024px, 1440px)
- [ ] Visual review completed
- [ ] No known regressions
- [ ] Legacy implementation removed or explicitly retained with ADR
- [ ] Documentation/state updated

## 8. Migration Strategy
- Incremental replacement by route/feature, not big bang.
- Legacy and new code coexist behind feature flags or route prefixes during transition.
- Each migration step: implement new -> verify -> migrate route -> remove legacy.
- No orphaned legacy code. Every legacy file has a migration task or ADR.

## 9. Decision Records
Significant decisions recorded as ADRs in `.spec/decisions/`:
- Architecture choices (state management, routing, data fetching)
- Design system choices (tokens, component library)
- Migration strategy choices
- Any deviation from this constitution

## 10. Autonomous Operation
- The agent owns the execution process.
- Human interaction reserved for irreducible product decisions only.
- State persists in repository; survives crashes, resets, restarts.
- Next agent resumes from `.spec/state/current.md` without conversation history.

---

## Amendments (v2 — approved 2026-08-24 via Master Execution Plan v2.0)

The user approved Master Plan v2 (including these amendments) by instructing autonomous execution.

**A1 · UI-state grid is a hard gate (extends §2/§7).**
Every screen specification MUST define: loading / error / empty / filtered-empty / conflict-revert /
unauthorized / permission-denied states. A feature without the full grid fails its gates.

**A2 · Cross-feature access via public API only (refines §4).**
Features never import each other's internals. Permitted channels: a feature's public `index.ts`
exports (typically read hooks over shared query keys), `entities/` schemas, and query invalidation.
Promote to `shared/` only at ≥2 consumer features.

**A3 · Destructive-action rule (extends §6).**
No `window.confirm`. All destructive/irreversible actions use AlertDialog with explicit consequence copy.

**A4 · Standing user directives (operational law).**
1. Execute directly on branch `dev`.
2. Autonomous `git commit` at every checkpoint once verify.sh gates pass.
3. Never push without explicit request; never touch user's uncommitted WIP without asking.
4. No Prisma schema changes this phase (R8 gamification-migration trap).

---
*This constitution is binding. Amendments require explicit human approval and ADR.*
