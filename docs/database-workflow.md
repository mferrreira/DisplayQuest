# Database Workflow (Prisma)

## Objective
Avoid data-loss surprises and make local/production deploys predictable.

## Rules
- Do not use `prisma db push` as the default flow.
- Use versioned migrations in `prisma/migrations`.
- Keep `schema.prisma` and migrations in sync in every PR.

## Local development
1. Change schema.
2. Create migration:
```bash
npm run db:migrate:dev -- --name your_change_name
```
3. If needed, re-generate client:
```bash
npm run db:generate
```
4. Seed (optional, dev/test only):
```bash
npm run db:seed
```

## Deploy (safe path)
Use:
```bash
npm run db:safe-deploy
```

Optional env flags:
- `BACKUP_BEFORE_MIGRATE=1` to create SQL dump with `pg_dump`
- `BACKUP_DIR=./backups` to control backup folder

## Docker flow
`docker-compose.yml` now runs:
- `prisma migrate deploy`

Seed is not executed automatically on startup/deploy (dev-only manual action).

This avoids destructive schema drift from `db push`.

## Rollback strategy
Prisma rollback is forward-fix oriented:
- Prefer new corrective migrations.
- For hard rollback, restore DB backup.

## Useful commands
```bash
npm run db:migrate:status
npm run db:migrate:deploy
npm run db:reset:local
```
