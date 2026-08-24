# ADR-003 · nuqs for URL state

**Status**: Accepted · **Date**: 2026-08-24

## Context
Filters, tabs, pagination and date ranges live in `useState`: unshareable, lost on refresh,
browser back/forward broken, invisible to SSR. Options: raw `useSearchParams`, next-intl routing,
nuqs.

## Decision
Adopt **nuqs** for shareable UI state: task filters (projectId/status/search/overdue), tabs,
date ranges, pagination. Parsers declared once per feature; defaults explicit; pt-BR slugs kept
(PLAN.md Q2).

## Consequences
- URL becomes source of truth for those states → components simplify.
- Server components can read parsed params for prefetch.
- One more dependency to pin carefully under legacy-peer-deps (install one-by-one, R3).
