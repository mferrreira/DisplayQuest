# ADR-001 · Incremental migration, not rewrite

**Status**: Accepted · **Date**: 2026-08-24

## Context
The frontend is architecturally obsolete (13 contexts, no cache layer, untyped API client) but in
daily use by an active lab. A big-bang rewrite would freeze feature work for weeks and risk
unshippable regressions with zero test safety net.

## Decision
Migrate route/feature-by-feature: new feature implementation → verify → swap route → delete that
domain's legacy imports. Legacy and new architectures coexist during transition; import-count-zero
per domain gates every checkpoint (methodology §17, EXECUTION-PLAN R7).

## Consequences
- Two architectures coexist temporarily; hard rule prevents "forever".
- Each epic ships value independently; any session can stop at a checkpoint.
- Cost: temporary duplication of patterns (e.g., context + query hooks) per migrated domain.
