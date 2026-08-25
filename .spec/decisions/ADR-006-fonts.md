# ADR-006 · Fonts — CORRECTED during execution (T1.1 discovery)

**Status**: Accepted (amended 2026-08-24, same day) · **Supersedes**: original @fontsource proposal

## Correction
Original premise (D-10) said runtime font was Arial. Reading `app/layout.tsx` during T1.1 shows the
root layout ALREADY applies `next/font/google` Inter to `<body className={inter.className}>`; the class
selector beats globals.css' `body { font-family: Arial }` element rule. Runtime = build-time
self-hosted Inter, and the CP-0 pixel-identical baseline was captured WITH it.

## Decision (revised)
1. KEEP `next/font/google` Inter as-is — switching sources would shift metrics against the visual
   baseline for zero benefit.
2. Add `JetBrains_Mono` via `next/font/google` in root layout; expose `--font-mono` token in
   `@theme` for timers/ids (E3 consumes).
3. Delete the dead `body { font-family: Arial }` rule from globals.css in the same commit
   (zero visual risk — overridden declaration) so nobody is misled again.
4. Offline-Docker concern resolved empirically: builds already download Google fonts successfully;
   revisit ONLY if a build environment proves airgapped.

## Consequences
- T1.6 scope shrinks to: mono token + dead-rule removal (+ optional metadata generator cleanup).
- Baseline continuity preserved through CP-1.
