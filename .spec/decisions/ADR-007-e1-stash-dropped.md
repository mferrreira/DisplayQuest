# ADR-007 · Drop E1 stash; rebuild Shell & Auth fresh

**Status**: Accepted · **Date**: 2026-08-24 · **Decided by**: user (explicit answer during v2 planning)

## Context
Prior session's E1 WIP (route groups `(auth)`/`(dashboard)` + server layout guard) was stashed as
`stash@{0}: "E1 WIP: route groups + server guard (desfeito a pedido do usuario)"`. Discovery D-9
recorded that verification looped because `.eslintrc.json` overrides scoped 5 legacy files by OLD
paths, which stopped matching after `git mv`. The v2 planning pass surfaced the ambiguity between
the label ("undone at user's request") and D-9's mechanical explanation.

## Decision
The user chose: **drop the stash, rebuild E1 fresh** following Master Plan v2. `git stash drop` executed
during CP-0.5 (dropped f144dcb). The D-9 knowledge survives as T1.1's first step: convert `.eslintrc.json`
overrides to basename matching BEFORE any file move.

## Consequences
- Clean provenance for the shell; no inherited half-state.
- Slight time cost re-doing route-group moves (mechanical).
- If any future archaeology needs the diff, commit f144dcb694406e0e2dca58ff5fedc519e8018d5d remains in
  reflog until garbage collection — do NOT rely on it.
