# {NN} · SPEC — {nome da funcionalidade}

> Contrato de **comportamento** da funcionalidade `{NN}`: o "o quê" e o "why", sem o
> "como". Esta é a **fonte de verdade** do que será implementado — se o código divergir
> daqui, o código está errado. Qualquer mudança de requisito abre nova revisão.
>
> Seções em PT-BR sem acentos (convenção do repo). IDs/enums em inglês.

## 1. Propósito

{Uma a três frases: problema/oportunidade, domínio-alvo, fronteira da funcionalidade.}

## 2. Contexto atual (linha de base)

{Estado verdadeiro do sistema hoje, com evidências: arquivos/lines existentes,
comportamento atual, lacunas identificadas. Sem adivinhar; citar código existente.}

## 3. Atores e papéis

| Ator | Papel | Interação |
|---|---|---|
| {ator} | {role/perfil} | {o que faz nesta funcionalidade} |

## 4. Requisitos funcionais

### RF-{NN}.{n} — {título}

- **Descrição:** ...
- **Fronteira:** módulo/domínio onde vive
- **Entradas/Saídas:** ...
- **Cenário principal (Gherkin):** Given/When/Then
- **Regras de negócio:** (enumera as regras, ex: dedup, penalidade, prefixo)**

## 5. Requisitos não funcionais

| Categoria | RNF | Critério de verificação |
|---|---|---|
| {ex: Segurança} | {desc} | {teste/evidência} |

## 6. Modelo de dados (se aplicável)

{Modelo(s) a criar/alterar no `prisma/schema.prisma`; migração; índices; observações.}

## 7. Contratos de API e eventos

### 7.1 Endpoints novos/alterados
| Método | Rota | Descrição | Permissão |
|---|---|---|---|
| ...

### 7.2 Eventos de domínio publicados/consumidos
| Evento | Publisher | Consumidor |
|---|---|---|
| ...

## 8. Casos de teste / evidência esperada

{Lista de testes esperados (unit/integration/e2e), como os gate commands rodam, e que
contagem de testes é esperada ao final desta funcionalidade.}

## 9. Acceptance criteria (definitivos e rastreáveis)

Cada AC: **observável**, **testável por terceiro**, com referência a teste/evidência.

| ID | Done criterion (Given/When/Then) | Evidência para verificar | Rastreia |
|---|---|---|---|
| AC-{NN}-01 | {criterio testável} | {teste/query/evidência} | RF-{NN}.{n} |
| ... | ... | ... | ... |

## 10. Fora de escopo (desta versão)

{Lista do que NÃO será feito nesta funcionalidade; evita creep.}

## 11. Dependências e bloqueadores

| Item | Tipo (dep/bloqueador externo) | Estado |
|---|---|---|
| ... | ... | ... |
