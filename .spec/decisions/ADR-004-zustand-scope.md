# ADR-004 · Zustand scope — cross-feature client state only

**Status**: Accepted · **Date**: 2026-08-24

## Context
Zustand is already installed but unused. Current cross-component needs (active work-session id for
the floating timer) are handled by provider stacking and prop/context leaks.

## Decision
ONE small UI store (`shared/stores/ui-store.ts`) for genuinely cross-feature client state:
`activeSessionId`, density/compact preferences. Everything else: local useState (ephemeral),
TanStack Query (server), nuqs (URL). No Zustand for server data, no new contexts for these concerns.

## Consequences
- Zustand stops being dead weight; becomes load-bearing in E3.
- Store stays tiny by constitution §5; growth requires ADR amendment.
