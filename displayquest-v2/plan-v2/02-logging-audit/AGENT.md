# 02 · AGENT — Logging & Audit centralizado

> Regras de **operação do agente executor** nesta funcionalidade. Este arquivo é o
> "modo de operação": como pensar, o que fazer primeiro, o que não fazer. Leia antes
> de qualquer mudança de arquivo e releia a cada transição de lote.

## 1. Missão

Executar o `PLAN.md` desta pasta contra a `SPEC.md` aprovada, mantendo todos os gates
do `plan-v2/ARCHITECTURE.md` verdes e registrando cada transição em `STATE.json`.
**Não há espaço para "improvisar para frente"; divergência de SPEC = defeito.**
Alvo de rota: trilha imutável e consultável atendendo RNF-17 + regra de negocio 10.

## 2. Ordem de trabalho (regra rígida)

1. Ler `plan-v2/ARCHITECTURE.md` (processo) + `AGENTS.md` (gotchas reais) + este `AGENT.md`.
2. Ler `SPEC.md` (contrato), `PLAN.md` (caminho) e `02/STATE.json`.
3. Conferir `plan-v2/state.json` e este `STATE.json`: etapa e evidências atuais.
4. Implementar o **próximo lote** do PLAN. Só o próximo. Nunca dois de uma vez.
5. Rodar os gates do lote. **Vermelho → rollback** (PLAN seção 5). **Verde → commitar o
   lote + atualizar STATE.**

## 3. Regras de conduta

- **Um único escritor:** `prisma.audit_logs` (ou `prisma.auditLogs`) **só** pode aparecer em
  `backend/modules/audit/infrastructure/prisma-audit-log.gateway.ts`. Módulos sensíveis
  publicam via port `AuditLogWriter` (injetado no composition root), nunca via Prisma direto.
  Verificar a cada commit com `rg "audit_logs|auditLogs" backend/modules -g '!audit/**'` = vazio.
- **Nenhum `prisma.history.create` novo.** O legado (`history`) continua existindo para lab
  notices/prêmios e fica intocado; a exceção é **remover** o `history.create` do
  work-execution (`work-session-service.gateway.ts` ~linha 270) substituindo pelo writer.
- **Append-only:** nunca expor `update`/`delete` de `audit_logs` no writer nem nas rotas; a
  imutabilidade é reforçada por trigger SQL na migração.
- **Sem migração de dados** entre `history` e `audit_logs`; sem `prisma db push` — sempre
  `migrate dev` (local) / `deploy` (prod). Trigger e índices entram na migração versionada.
- **RBAC sem permission nova:** use `ensureAnyRole(["COORDENADOR", "GERENTE"])`; não crie
  `VIEW_AUDIT_LOGS` neste feature (pertence ao 01).
- **Publicação pós-write de domínio, síncrona, mesma instância de writer** criada uma vez no
  `createBackendComposition()` e compartilhada nos `gatewayDependencies`.
- Nenhuma regra de negócio em route handler ou componente de UI; use-cases e portas no módulo.
- `tsc --noEmit` e `vitest` são a verdade; falso-positivo de LSP não conta.
- Valores reais de segredo (NEXTAUTH_SECRET etc.) **nunca** impressos nem commitados.
- Se a SPEC e o PLAN divergirem, **parar** e reportar; não escolher um lado.

## 4. Checklist de verificação (final)

| Gate | Comando | Resultado esperado |
|---|---|---|
| G1 lint | `npx eslint --no-eslintrc --config .eslintrc.json <modificados>` | exit 0 |
| G2 type | `npx tsc --noEmit` | 0 errors |
| G3 unit | `set -a; source .env; set +a; npx vitest run` | 256/257 + novos verdes (~+6 unit) |
| G4 integração | `docker compose up -d postgres && npx vitest run` | green (`audit-immutability`, `audit-writer-roundtrip`) |
| G5 migração | `npx prisma migrate dev`/`deploy` | sem `db push`; sem drift (`migrate status`) |
| Anti-scatter | `rg "prisma.audit_logs|prisma.auditLogs" backend/modules -g '!audit/**'` | vazio |
| Legado | `rg "prisma.history.create" backend/modules` | só LabNotice (repositório legado) continua |
| STATE | evidências + ACs mapeadas em `STATE.json` | AC-02-01..AC-02-13 com testRef/status