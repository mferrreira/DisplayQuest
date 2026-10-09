# {NN} · PLAN — {nome da funcionalidade}

> Contrato de **execução** da funcionalidade `{NN}`. Deriva da SPEC aprovada
> (`{NN}/SPEC.md`). Define a ordem de implementação em etapas (batches), cada uma com
> arquivos tocados, done criteria observáveis e gates de verificação. **A SPEC é a
> fonte de verdade do comportamento; este PLAN é a fonte de verdade da doação.**
>
> Leia antes: `plan-v2/ARCHITECTURE.md` (processo), `{NN}/SPEC.md` (contrato),
> `docs/04-arquitetura-tecnica.md` e `docs/06-guia-de-manutencao-handover.md` (regras),
> `AGENTS.md` (convenções e gotchas).

## 1. Escopo

Delimitação do que este PLAN cobre (funcional, arquitetural, de dados). O que **não**
cobre (Fora de escopo) deve estar explícito na SPEC; repetir aqui só se ajudar a
eliminar ambiguidade.

## 2. Dependências

- Do PLAN-v2: {lista de funcionalidades já `done`/`blocked` que este plano consome}
- De runtime/infra: {banco, cron, uploads, PDF template, serviços externos}

## 3. Etapas de implementação (ordem obrigatória)

Cada etapa é um **lote atômico** com evidência observável. Nunca avance sobre lote
vermelho.

### Etapa 1 — {título da etapa}

**Objetivo** (1–2 linhas)

**Arquivos a criar/alterar (caminhos completos):**

```
- backend/modules/{dominio}/...
- prisma/schema.prisma
- app/api/...
```

**Mudanças de schema (se houver):** {tabelas/campos, tipo, restrições}

**Done criteria desta etapa (todas observáveis):**
- [ ] DC1.1 — {criterio: comando/teste/invariante}
- [ ] DC1.2 — ...

**Gates desta etapa:** `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>` · `npx tsc --noEmit`

### Etapa 2 — ...

## 4. Verificação (final)

Assim que todas as etapas estiverem verdes, executar na ordem (com `set -a; source .env; set +a`):

```
npx eslint --no-eslintrc --config .eslintrc.json <todos arquivos alterados>  # G1
npx tsc --noEmit                                                              # G2
npx vitest run                                                                # G3 (256/257; único fail conhecido floating-session-timer)
(se schema/infra) npx prisma migrate dev || npx prisma migrate deploy         # G5
```

## 5. Rollback

- **Se** qualquer gate falhar (ou se `SPEC` divergir), `git checkout -- <caminhos>` e
  `git reset --hard <checkpoint-verde>`; não siga adiante.
- **Depois** volte à SPEC, repense, re-implemente, re-verifique.
- **Registro**: rollback vai para o cache em `STATE.json` (seção `rollbacks`) — motivo + ação tomada.

## 6. Entregáveis de conclusão

Checklist que, tudo verde, marca `{NN}` como `done`:

- [ ] Todos os gates (G1–G3, e G4/G5 se aplicável) verdes
- [ ] Todas as ACs da SPEC com teste/evidência mapeada
- [ ] Migrações versionadas sem `db push`
- [ ] STATE.json atualizado (eventos, evidências, rollbacks)
