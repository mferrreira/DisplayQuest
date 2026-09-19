# 06 · AGENT — auth-sso-ldap

> Regras de **operacao do agente executor** nesta funcionalidade. Este arquivo e o
> "modo de operacao": como pensar, o que fazer primeiro, o que nao fazer. Leia antes
> de qualquer mudanca de arquivo e releia a cada transicao de lote.

## 1. Missao

Executar o `PLAN.md` desta pasta contra a `SPEC.md` aprovada, mantendo todos os gates do
`plan-v2/ARCHITECTURE.md` verdes e registrando cada transicao em `STATE.json`.
**Nao ha espaco para "improvisar para frente"; divergencia de SPEC = defeito.**

## 2. Contexto critico (ler antes de mexer)

- Auth hoje = next-auth v4 (`next-auth: 4.24.11`), **CredentialsProvider ONLY** em
  `lib/auth/config.ts:10-38`, bcrypt contra `users.password`, sessao JWT 48h + sliding.
- RBAC/autorizacao ja isolado: `backend/modules/identity-access/` (decisao de WHO pode
  WHAT) + `lib/auth/rbac.ts` (`PERMISSIONS`, **sem ADMIN**). Esta feature **nao toca**
  em `rbac.ts`, `features.ts`, `server-auth.ts`, `api-guard.ts` nem em
  `identity-access` (D-06-02) — diff vazio desses arquivos e done criterion (PLAN §6).
- `lib/auth/permissions.ts` **nao existe** no repo — nao criar.
- A verificacao de identidade (authentication) e que sai de dentro do next-auth para os
  seams de `backend/modules/identity-federation/` (D-06-02).
- Identidade federada (SSO/LDAP) **nao e** patch no CredentialsProvider (D-06-01).
- DisplayLab e projeto externo separado; planejamos contra o **contrato**, nunca seu
  internals. URLs/valores reais vem do dono — placeholders no runbook.
- 05 (identidade/onboarding) **ainda nao tem SPEC/PLAN escritos** (pasta vazia). Referir
  o contrato de 05 como pendente; nao desenhar como se 05 estivesse codificado (D-06-06).

## 3. Regras de conduta (reforco da casa)

- Nenhuma regra de negocio em route handler ou componente de UI — dominio nos modulos
  (`backend/modules/identity-federation/application/**`).
- Forbidden list de segredos — **nunca imprimir nem commitcar valores reais**: DisplayLab
  client secret, `LDAP_BIND_PASSWORD`, `NEXTAUTH_SECRET`. Logs de rota/callback nao
  printam payload de assertion nem credenciais.
- Env do runner (vitest/check) = `process.env`, nao `.env` com aspas:
  `set -a; source .env; set +a` (gotcha AGENTS.md). Em worktree, lint com
  `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>`.
- Nunca `prisma db push` — sempre `npx prisma migrate dev` (local) / `deploy` (prod).
- Farol de baseline: unit **256/257** (unico fail conhecido `floating-session-timer`);
  falha alem disso = regressao, parar.
- Se a SPEC e o PLAN divergirem, **parar** e reportar; nao escolher um lado.
- LSP pode reportar `Cannot find module` falso-positivo para arquivos novos; a verdade e
  `tsc --noEmit` + `vitest` (gotcha AGENTS.md).
- Nenhuma dependencia cruzada nova fora de `backend/composition/root.ts` (ou do modulo
  de composicao usado). `identity-federation` consome 02 (audit) so via port/coordenação.

## 4. Ordem de trabalho (regra rigida)

1. Ler `plan-v2/ARCHITECTURE.md` + `AGENTS.md` + este `AGENT.md`.
2. Ler `SPEC.md` e `PLAN.md`.
3. Conferir `state.json` global e `06/STATE.json`: etapa atual, evidencias.
4. Implementar o **proximo lote** do PLAN (E1→E8). So o proximo. Nunca dois de uma vez.
5. Rodar os gates do lote. **Vermelho → rollback** (PLAN §5, ARCHITECTURE §6).
   **Verde → commitar o lote + atualizar STATE.**

## 5. Decisoes do dono (nao reabrir)

- D-06-01 federacao e camada a parte, nao patch no CredentialsProvider.
- D-06-02 auth desacoplado do dominio do usuario: ports/contratos em
  `identity-federation`; RBAC intocado; `AUTH_FALLBACK_CREDENTIALS=0|1` gate o fallback.
- D-06-03 RBAC coarse da federacao (LF_*) distinto do RBAC fine do app; mapa
  coarse→fine; RBAC do app autoritativo.
- D-06-04 migracao **runtime** (nao schema/data): usuarios legados seguem com fallback;
  novos/SSO provisionam por `externalId`; invariant 1 usuario por external id
  (`users.externalId` unico).
- D-06-05 sem armazenar/imprimir credenciais ou secrets (env `${VAR:?}` + forbidden list).
- D-06-06 ultima feature; depende de todas, esp. 05. Referir contrato de 05 pendente.

## 6. Checklist de verificacao (aplicar a cada lote e no final)

| Gate | Comando | Resultado esperado |
|---|---|---|
| G1 lint | `npx eslint --no-eslintrc --config .eslintrc.json <arquivos do lote>` | exit 0 |
| G2 type | `npx tsc --noEmit` | 0 errors |
| G3 unit | `set -a; source .env; set +a; npx vitest run` | 256/257 + novos verdes |
| G4 integracao | `docker compose up -d postgres && npx vitest run` (lotes 4, 8) | green |
| G5 migracao | `npx prisma migrate dev` (lotes 4, 8) | versionada, sem `db push` |
| check:env | `npm run check:env` | verde (secrets denylist + novos vars validos) |

## 7. Checklist final (marka `06` done)

- [ ] G1–G5 verdes (G5 registrado; G4 quando tocar DB)
- [ ] Todas AC-06-01..AC-06-14 com evidencia no STATE
- [ ] Migracao `add_users_external_id_unique` versionada
- [ ] diff vazio em `rbac.ts`, `features.ts`, `server-auth.ts`, `api-guard.ts`,
      `identity-access/**`
- [ ] Nenhum segredo impresso/committado (grep limpo); `check:env` verde
- [ ] `docs/09-sso-ldap-runbook.md` entregue (DisplayLab contract, LDAP, secrets,
      rollout/rollback do fallback)
- [ ] STATE.json atualizado (evidencias, gates, rollbacks, decisions D-06-01..11)