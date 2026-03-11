# Guia de Leitura da Documentacao APOO

## Objetivo

Esta pasta concentra a documentacao formal do sistema `DisplayQuest` no formato de Analise e Projeto Orientado a Objetos.

Ela foi estruturada para atender dois objetivos simultaneos:

- apoiar leitura academica e de projeto
- facilitar onboarding e manutencao por novos desenvolvedores

## Ordem recomendada de leitura

1. `01-sumario-executivo.md`
2. `02-visao-geral-e-escopo.md`
3. `03-atores-e-glossario.md`
4. `04-requisitos-funcionais.md`
5. `05-requisitos-nao-funcionais.md`
6. `06-casos-de-uso-catalogo.md`
7. `07-casos-de-uso-expandidos.md`
8. `08-regras-de-negocio.md`
9. `09-maquinas-de-estado.md`
10. `10-analise-e-modelo-conceitual.md`
11. `11-projeto-arquitetural.md`
12. `12-padroes-de-projeto-e-diretrizes-de-extensao.md`
13. `13-rastreabilidade-e-priorizacao.md`

Depois da leitura funcional, seguir para os artefatos tecnicos que ainda serao produzidos:

## Escopo da documentacao

Esta documentacao nao descreve cada funcao do codigo-fonte nem cada detalhe de interface.

Ela prioriza:

- processos suportados pelo sistema
- atores e responsabilidades
- requisitos
- casos de uso
- estados e regras relevantes
- arquitetura e manutencao futura

## Fontes de verdade usadas nesta etapa

- `README.md`
- `docs/01-visao-geral-sistema.md`
- `docs/02-manual-do-usuario.md`
- `docs/03-regras-de-negocio.md`
- `docs/04-arquitetura-tecnica.md`
- `docs/07-modelo-de-dados.md`
- `backend/README.md`
- `app/README.md`
- `backend/composition/root.ts`
- `prisma/schema.prisma`
- modulos em `backend/modules/*`
- rotas em `app/api/*`

## Observacao importante

Algumas informacoes organizacionais ainda nao estao explicitas no repositorio, como o nome formal da instituicao, o nome oficial do laboratorio e eventuais restricoes normativas locais. Quando necessario, estas lacunas sao marcadas como pendencias de validacao, sem inventar contexto externo.
