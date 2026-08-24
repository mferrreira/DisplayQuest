# AGENTS.md

## What this repo is

DisplayQuest: a Next.js 15 App Router lab-management platform (tasks, projects, work sessions, gamification). React 19, TypeScript 5, Prisma ORM, PostgreSQL, shadcn/ui, Zustand, next-auth.

## Key commands

```bash
npm install               # uses --legacy-peer-deps (enforced by .npmrc)
npm run dev               # Next dev server on :3000
npm run build             # next build (eslint + TS errors are IGNORED in build)
npm run lint              # next lint

# Database (PostgreSQL via docker-compose)
docker-compose up -d      # starts postgres on :5432 (user/pass: display-quest/display-quest123)
npm run db:generate        # prisma generate
npm run db:migrate:dev     # prisma migrate dev
npm run db:migrate:deploy  # prisma migrate deploy
npm run db:reset:local     # prisma migrate reset --force (nuclear, dev only)
npm run db:seed            # tsx prisma/seed.ts (manual, dev only)
npm run db:safe-deploy     # scripts/db-safe-deploy.sh (optional pg_dump + migrate deploy)
```

## Architecture (critical patterns)

### Backend composition root

Every API route **must** resolve modules through the composition singleton:

```ts
import { getBackendComposition } from "@/backend/composition/root"
const { taskManagement } = getBackendComposition()
```

**Never** call `createXModule()` directly in route handlers. Cross-domain dependencies are wired in `backend/composition/root.ts`.

### Backend module layout

```
backend/modules/<domain>/
  application/contracts.ts   # DTOs, input/output types
  application/ports/         # interfaces (ports)
  application/use-cases/     # business logic (when present)
  infrastructure/            # Prisma impls, adapters, event publishers
  index.ts                   # factory (createXModule)
```

Modules: identity-access, user-management, project-management, project-membership, task-management, work-execution, reporting, gamification, store, notifications, lab-operations.

### API route pattern

Routes live in `app/api/<domain>/route.ts`. Thin handlers: parse request, authenticate, delegate to module. Auth helpers live in `lib/auth/`:
- `requireApiActor()` / `ensurePermission()` for API routes (from `lib/auth/api-guard`)
- `requireAuth()` / `requireRole()` / `requirePermission()` (from `lib/auth/server-auth`)
- RBAC roles: COORDENADOR, GERENTE, LABORATORISTA, PESQUISADOR, GERENTE_PROJETO, COLABORADOR, VOLUNTARIO

### Frontend

- Layout chain: `app/layout.tsx` -> `app/client-layout.tsx` -> SessionProvider -> ThemeProvider -> dashboard providers (UserProvider, ProjectProvider, TaskProvider)
- State: domain contexts in `contexts/`, local feature hooks in `hooks/`
- UI components: `components/ui/` (shadcn), `components/features/` (domain), `components/admin/`, `components/forms/`
- Path alias: `@/*` maps to project root

### Prisma

- Schema: `prisma/schema.prisma`
- Generated client: `lib/generated/prisma` (gitignored)
- Seed: `prisma/seed.ts` (run manually, never auto on startup)
- DB is PostgreSQL; `better-sqlite3` is also a dependency but PostgreSQL is the primary target

## Gotchas

- `next.config.mjs` has `eslint.ignoreDuringBuilds: true` and `typescript.ignoreBuildErrors: true` -- `npm run build` will succeed even with type errors. Run `npx tsc --noEmit` separately to catch type issues.
- `.npmrc` sets `legacy-peer-deps=true` -- peer dep conflicts are suppressed by design.
- Docker build uses `npm i --legacy-peer-deps`. The Dockerfile copies `cli/` into the production image.
- Task visibility model: `public` (visible, individual progress), `delegated`/`private` (restricted to assignees). `isGlobal=true` means a global lab task.
- Multi-assignee support via `task_assignees` table; `assignedTo` kept for backward compat.
- `middleware.ts` only handles `/uploads/avatars/*` (sets WebP content-type + security headers). No auth middleware.
- User status must be `"active"` to pass `requireActiveUser()` checks.
- Output mode is `standalone` (for Docker). Images are `unoptimized`.
- Gamification migrations `202602161822_add_gamification_core_schema` and `202602162235_add_gamification_chest_schema` were NEUTRALIZED into commented no-ops (2026-08-24): the gamification models were previously reverted from `prisma/schema.prisma` while the migrations remained, causing permanent drift -- every new `prisma migrate dev` proposed `DROP TABLE ... gamification_*`. Production DB never had those tables (migrations only recorded as applied in `_prisma_migrations`) and the gamification module only uses `users`/`history`. When gamification work resumes: re-add the models to schema.prisma and generate a fresh migration; do not resurrect the neutralized SQL.

## Verification checklist

After changes, run:
1. `npm run lint`
2. `npx tsc --noEmit` (build skips TS checks)
3. If touching API routes: verify `getBackendComposition()` usage, no direct module instantiation
4. If touching Prisma schema: `npm run db:generate` + `npm run db:migrate:dev`
5. If adding a new module: register it in `backend/composition/root.ts`
