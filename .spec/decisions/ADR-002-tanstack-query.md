# ADR-002 · TanStack Query v5 for server state

**Status**: Accepted · **Date**: 2026-08-24

## Context
All server data is fetched in `useEffect` inside 13 hand-rolled contexts: no caching, no
deduplication, ad-hoc optimistic updates with manual rollback, cross-context coupling
(task→users fetch). Alternatives considered: SWR, Redux Toolkit Query, status quo.

## Decision
Adopt **TanStack Query v5** as the only home for server state. Query keys via a typed factory
(`lib/query/keys.ts`); mutations with `onMutate` snapshot-rollback pattern; invalidation maps per
domain (spec/state-management.md). React Context remains only for genuinely global providers
(session, theme, query client).

## Consequences
- Kills the context-fetch pattern feature-by-feature (ADR-001 sequencing).
- Optimistic updates become standardized, testable hooks (MSW contract tests).
- v5 API (object signatures) is mandatory — no v4 snippets.
