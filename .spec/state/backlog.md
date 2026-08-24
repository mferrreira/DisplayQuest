# Backlog (out-of-scope opportunities — do NOT derail migration)

- [ ] Orphan columns on `tasks` (`order`, `parentId` + FK/index) exist in live DB but not schema.prisma. Zero code references. Optional cleanup migration — PENDING USER DECISION (discovery §11 Residue B). Do nothing without explicit user approval (gamification-migration trap class).
- [ ] Remove junk deps (immer, fs, path pinned "latest", unused radix/embla/cmdk/input-otp…) — T10.2.
- [ ] Phantom `_prisma_migrations` row `20260820163441_fasd` — cosmetic, ignore.
- [ ] i18n beyond pt-BR, email notifications, websockets, onboarding flow, global search/command palette — OUT_OF_SCOPE this phase (PLAN.md R10 / ux-model open questions).
- [ ] Legacy purchase rows in dev DB: id=1 "delivered", id=2 "processing" — propose UPDATE to "completed"/"cancelled" or DELETE; PENDING USER DECISION (do not touch data autonomously).
- [ ] B-1 · Remove .eslintrc.json override when each of these is rebuilt: laboratorio/page.tsx (E5), loja/page.tsx + loja/gerenciar/page.tsx (E6), user-approval.tsx (E8), volunteer-actions.tsx (E8/E9). Violations: conditional hooks after early returns, unescaped quotes. Fix during rebuild, then delete the file entry from overrides.
- [ ] B-2 · Visual baseline dir is gitignored (8.7MB). If CI visual regression is adopted later, move baselines to proper artifact storage; regenerate locally via scripts/capture-visual-baseline.mjs.
