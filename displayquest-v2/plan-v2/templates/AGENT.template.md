# {NN} · AGENT — {nome da funcionalidade}

> Regras de **operação do agente executor** nesta funcionalidade. Este arquivo é o
> "modo de operação": como pensar, o que fazer primeiro, o que não fazer. Leia antes
> de qualquer mudança de arquivo e releia a cada transição de lote.

## 1. Missão

Executar o `PLAN.md` desta pasta contra a `SPEC.md` aprovada, mantendo todos os gates
do `plan-v2/ARCHITECTURE.md` verdes e registrando cada transição em `STATE.json`.
**Não há espaço para "improvisar para frente"; divergência de SPEC = defeito.**

## 2. Ordem de trabalho (regra rígida)

1. Ler `plan-v2/ARCHITECTURE.md` (processo) + `AGENTS.md` (gotchas reais) + este `AGENT.md`.
2. Ler `SPEC.md` (contrato) e `PLAN.md` (caminho de execução).
3. Conferir `state.json` global e este `STATE.json`: qual a etapa atual, o que as
   evidências mostram.
4. Implementar o **próximo lote** do PLAN. Só o próximo. Nunca dois de uma vez.
5. Rodar os gates do lote. **Vermelho → rollback** (seção 0 do AGENT/PLAN e seção 6 do
   ARCHITECTURE). **Verde → commitar o lote + atualizar STATE.**

## 3. Regras de conduta

- Nenhuma regra de negócio em route handler ou componente de UI — domínio nos módulos.
- Nenhuma dependência cruzada nova fora de `backend/modules/composition/root.ts` (ou
  módulo de composição do domínio). Se um domínio precisa de outro, registra na composição.
- `tsc --noEmit` e `vitest` são a verdade; falso-positivo de LSP não conta.
- Valores reais de segredo (NEXTAUTH_SECRET etc.) **nunca** impressos nem commitados.
- Não usar `prisma db push`: sempre `migrate dev`/`deploy`.
- Se a SPEC e o PLAN divergirem, **parar** e reportar; não escolher um lado.

## 4. Checklist de verificação (final)

| Gate | Comando | Resultado esperado |
|---|---|---|
| G1 lint | `npx eslint --no-eslintrc --config .eslintrc.json <modificados>` | exit 0 |
| G2 type | `npx tsc --noEmit` | 0 errors |
| G3 unit | `set -a; source .env; set +a; npx vitest run` | 256/257 + novos verdes |
| G4 integração | `docker compose up -d postgres && npx vitest run` | green |
| G5 migração | `nppx prisma migrate dev/deploy` | sem `db push` |
