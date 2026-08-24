# Backlog (out-of-scope opportunities — do NOT derail migration)

- [ ] Orphan columns on `tasks` (`order`, `parentId` + FK/index) exist in live DB but not schema.prisma. Zero code references. Optional cleanup migration — PENDING USER DECISION (discovery §11 Residue B). Do nothing without explicit user approval (gamification-migration trap class).
- [ ] Remove junk deps (immer, fs, path pinned "latest", unused radix/embla/cmdk/input-otp…) — T10.2.
- [ ] Phantom `_prisma_migrations` row `20260820163441_fasd` — cosmetic, ignore.
- [ ] i18n beyond pt-BR, email notifications, websockets, onboarding flow, global search/command palette — OUT_OF_SCOPE this phase (PLAN.md R10 / ux-model open questions).
