# 05 · AGENT — Multi-Lab as a Service

> Regras de **operacao do agente executor** nesta funcionalidade. Este arquivo e o
> "modo de operacao": como pensar, o que fazer primeiro, o que nao fazer. Leia antes
> de qualquer mudanca de arquivo e releia a cada transicao de lote.

## 1. Missao

Executar o `PLAN.md` desta pasta contra a `SPEC.md` aprovada, mantendo todos os gates
do `plan-v2/ARCHITECTURE.md` verdes e registrando cada transicao em `STATE.json`.
**Nao ha espaco para "improvisar para frente"; divergencia de SPEC = defeito.**

O coracao do trabalho: entregar o **onboarding self-serve de novas instancias** —
dominio puro `backend/modules/provisioning/` (subdominio, secrets, render de
fragmento/env/volume, tokens single-use), registry no banco da instancia coordenadora
(`provisioning_records`/`provisioning_tokens`, D-05-06), endpoint fino
`/api/provisioning/*` com burn atomico e idempotencia, seam de branding `INSTANCE_*`
(lab-agnostic), CLI host e runbooks de roteamento. **Roteamento por subdominio e infra
(D-05-04): o app so le env para branding.**

## 2. Ordem de trabalho (regra rigida)

1. Ler `plan-v2/ARCHITECTURE.md` (processo) + `AGENTS.md` (gotchas reais) + este `AGENT.md`.
2. Ler `SPEC.md` (contrato) e `PLAN.md` (caminho de execucao).
3. Conferir `plan-v2/state.json` global e este `STATE.json`: qual a etapa atual, o que as
   evidencias mostram.
4. Implementar o **proximo lote** do PLAN (Etapa 1 → 2 → 3 → 4 → 5 → 6 → 7). So o proximo.
   Nunca dois de uma vez.
5. Rodar os gates do lote. **Vermelho → rollback** (secao 5 do PLAN e secao 6 do
   ARCHITECTURE). **Verde → commitar o lote + atualizar STATE.**

## 3. Regras de conduta

- **Nenhuma regra de negocio em route handler ou componente de UI** — o fluxo de
  provisioning vive em `backend/modules/provisioning/` (dominio puro, sem I/O de disco
  no use case). Rotas `/api/provisioning/*` sao thin adapters: mapeiam erros tipados
  para HTTP (400/401/403/404/409/410/201/200) e fazem o env-gate `isCoordinator`.
- **App lab-agnostic (D-05-01/04):** `process.env.INSTANCE_*` e lido **somente** em
  `lib/config/instance.ts`; consumidores de branding sao server-side (layout/login/
  notificacao de reporting/CSV) e clients recebem por props. **Nunca** `localStorage`,
  hostname check nem deteccao de instancia em logica de dominio.
- **Secrets (D-05-05):** `NEXTAUTH_SECRET` mintado pelo dominio e exibido em full
  **uma unica vez** na claim; no mint/GET/list vai **apenas mascarado**; nunca logado
  nem commitado. Retirar do `console.log` mesmo em dev.
- **Nenhum caminho de escrita novo no container (gotcha Dockerfile/AGENTS.md):** o
  container roda `USER nextjs` com writability so em `/app/public/uploads` e
  `/app/data/uploads`. O endpoint **nao** cria path novo; a materializacao de artefatos
  em disco e via CLI no host (`.deploy/labs/<slug>/`) ou, se configurado,
  `/app/data/uploads/.deploy/<slug>/`. Qualquer outro path → EACCES = defeito.
- **Nao usar `prisma db push`:** migracao versionada
  `add_provisioning_registry` via `npx prisma migrate dev`/`deploy`; **nenhum** `Lab`
  model, **nenhum** `labId` em tabela existente.
- **Eventos de auditoria:** `INSTANCE/PROVISIONED`, `INSTANCE/TOKEN_ISSUED`,
  `INSTANCE/TOKEN_CONSUMED` entram no catalogo da feature 02 (aditivo) e sao emitidos
  via `AuditLogWriter` ja no root — nao gravar de novo e nao bifurcar writer.
- `tsc --noEmit` e `vitest` sao a verdade; falso-positivo de LSP nao conta (gotcha
  AGENTS.md: `Cannot find module` para arquivos recem-criados).
- Se a SPEC e o PLAN divergirem, **parar** e reportar; nao escolher um lado.
- Lint em worktree: `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>`
  (workaround AGENTS.md), nunca o `npm run lint` cru em worktree.
- Enviar env para vitest: `set -a; source .env; set +a; npx vitest run` (o `.env` tem
  aspas nos valores; exportar antes).
- Nao commitar `tests/` por padrao (gitignored) — ver a regra da casa em AGENTS.md
  (feature 01): os testes unit podem ter `!tests/unit` adicionado ao `.gitignore`
  **com aval do dono**; conferir antes.

## 4. Checklist de verificacao (final)

| Gate | Comando | Resultado esperado |
|---|---|---|
| G1 lint | `npx eslint --no-eslintrc --config .eslintrc.json <modificados>` | exit 0 |
| G2 type | `npx tsc --noEmit` | 0 errors |
| G3 unit | `set -a; source .env; set +a; npx vitest run` | **256/257 de base** (unico fail `floating-session-timer`) + ~8 unit novos verdes |
| G4 integracao | `docker compose up -d postgres && npx vitest run` | roundtrip do registry verde (`localhost:5432`) |
| G5 migracao | `npx prisma migrate dev\|deploy` | `add_provisioning_registry` sem `db push`, sem drift |

Anti-scatter final (obrigatorio antes de declarar a feature pronta):

```
grep -rn "INSTANCE_" --include="*.ts" --include="*.tsx" lib backend app components | grep -v "lib/config/instance.ts"
# esperado: 0 linhas fora do seam
grep -rn "model Lab" prisma/schema.prisma                       # esperado: 0
```

Quando fechar as etapas, atualizar `STATE.json`: ACs (AC-05-01..AC-05-11) com
`testRef`/status, `gates`, `evidence[]` (comandos e saidas), `rollbacks[]` se houver,
`timeline`. Nenhuma AC pode ficar `pending` se a feature for declarada pronta.