# displayquest-v2 — Planejamento da evolução v2 do DisplayQuest

> Container único do planejamento do DisplayQuest v2 (branch `dev`). Este folder é
> **organizacional**: agrupa, em subpastas independentes, a visão/requisitos, o
> meta-plano de planejamento, o pré-requisito arquitetural e o plano operacional. Cada
> subpasta mantém seu próprio processo e estado — nenhum meta-processo novo existe aqui.

## Estrutura

```
displayquest-v2/
├── spec-v2/       VISÃO: requisitos de alto nível do dono (fonte das features)
├── plan-v2/       PROCESSO: meta-plano Spec-Driven + features 01..06 (cada uma com PLAN/SPEC/AGENT/STATE)
├── clean-arch/    BASE: refatoração do backend para Clean Architecture (pré-requisito das features 01..06)
├── plan-v3/       OPERAÇÃO: correções e features pedidas por quem usa o sistema hoje (sessões, quadro, pontos) — done
├── plan-v4/       OPERAÇÃO: subtasks, animação de pontos, inativação (2026-10-05) — done (2026-10-07, DEC-78..98)
├── plan-v5/       OPERAÇÃO: domínio de projetos maduro — cronograma, pontos, relatórios técnicos, atestados (2026-10-06) — done (2026-10-14, V5-1..V5-12 + V5-fix-1/V5-fix-2; DEC-61..77, 99..104, 126..180)
├── plan-v6/       OPERAÇÃO: linguagem visual UI/UX + redistribuição das telas (2026-10-07, revisado 2026-10-14) — spec-driven, ready, V6-0 executado (DEC-105..114, 181..188)
└── plan-v7/       OPERAÇÃO: servidor MCP para os agents do laboratório (2026-10-15) — planejado, nenhuma onda começada (DEC-190..203, ASK-V7-01..15)
```

## Fluxo de dependências (unidirecional)

```
spec-v2 (visão/requisitos)
        └──> plan-v2/01..06 (planejamento e execução das features)
                 ^
                 |
        clean-arch (base arquitetural — precisa estar `done` antes de 01)

plan-v3 (demanda de uso) ──> execução direta, sem depender dos três acima

plan-v4 ──> fecha (V4-4/V4-5 subtasks) ──> plan-v5 (domínio de projetos; ordem por colisão em `tasks`, DEC-73)

plan-v6 (linguagem visual + redistribuição das telas) ──> camada de apresentação só — a
                                 ordem frente ao plan-v5 está resolvida: o plan-v5 fechou
                                 em 2026-10-14, então as colisões que travavam V6-4
                                 (×V5-4), V6-5 (×V5-2) e V6-7 (×V5-3) saíram do caminho.
                                 O bloqueio antigo (DEC-145, uma frente por vez) caiu com
                                 o fechamento do plan-v5. Home sem coluna secundária,
                                 largura toda (DEC-114).

plan-v7 (servidor MCP para os agents do laboratório) ──> camada de acesso por credencial,
                                 independente do plan-v6: não toca em tela, não muda
                                 navegação e não muda valor de permissão. O que ele entrega
                                 primeiro fica ABAIXO da interface (api_credentials no app,
                                 DEC-192/199) e só depois vem o servidor MCP em container
                                 próprio (DEC-190).
```

- `spec-v2/` registra a visão do dono (gamificação profunda, projeto mais complexo,
  logging/audit, roles/permissions, multi-lab SaaS, SSO/LDAP).
- `plan-v2/` transforma a visão em features planejadas (`NN-<nome>/`) com máquina de
  estados, gates G1-G5 e `state.json` global.
- `clean-arch/` isola o domínio do backend (sem Prisma no core, use cases com as
  regras, infra como adapters) **antes** das features; sem isso, as features v2
  carregariam dívida arquitetural.
- `plan-v3/` **não** nasce da visão do `spec-v2`: nasce do que quem usa o sistema
  relatou em uso — pausas automáticas silenciosas, pontos zerados para quem entrega no
  prazo, quadro que cresce sem limite. É independente das features 01..06 e pode
  executar em paralelo com elas.
- `plan-v4/` nasce do plan-v3 (o dono pediu subtasks e animação de pontos junto);
  `plan-v5/` nasce do desenho completo de domínio de projeto do dono (edital, cronograma,
  pontos de projeto, relatórios técnicos com IA, atestados com AcroForm) — tudo estendendo
  o que já existe, em ondas revertíveis, com DEC-61..77, DEC-99..104 e DEC-126..146 contínuas
  da numeração global (DEC-78..98 são do plan-v4 e DEC-105..125 de plan-v6 e
  clean-arch — houve colisão, comentários renumerados). O V5-1 fechou o bucket
  (SeaweedFS no lugar do MinIO, DEC-131), o V5-1a fechou os templates oficiais como asset
  versionado (`templates/`, guarda de deriva — DEC-128), o V5-2b abriu os dados do projeto
  (período, edital, processo, saldo — datas como data civil, DEC-132), o V5-2c pôs entregáveis e
  anexos do projeto no bucket — primeiro consumidor de produção do seam (DEC-133/134) — e o V5-2d
  deu capa e logo ao projeto, com o header do detalhe e a recaptura do guia (DEC-135), e o V5-2a
  abriu a leitura — qualquer autenticado vê todos os projetos e as partes deles, escrita intacta
  (DEC-136); o V5-2 foi dividido pelo dono em V5-2b/2c/2d/2a. O V5-3 levou o mesmo desenho de
  imagem ao perfil — `users.bannerKey` no bucket, capa no cartão "Meu Perfil" e no cartão do 1º
  lugar do pódio (DEC-137). Antes do V5-4, o dono respondeu em 2026-10-13 as perguntas que
  faltavam e as que estavam abertas em outros registros: dados de pessoa em `users` com CPF de
  leitura restrita (DEC-138), relatório técnico por projeto com DOCX por membro (DEC-139), carga
  no vínculo e PROPPI no projeto (DEC-140), cleanup dos status pré-contrato por migration
  (DEC-141), `backend/models/` encolhido (DEC-142), visibilidade de perfil virando batch V5-12
  (DEC-143), seam órfão fora (DEC-144), plan-v6 depois do plan-v5 (DEC-145) e a CVE do `next`
  registrada sem batch (DEC-146). O plan-v5 rodou as ondas V5-4b a V5-12 entre 2026-10-13 e
  14 (DEC-147..178), fechou em 2026-10-14 com o G5/G6 do guia (V5-close) e levou dois
  consertos depois do encerramento: o atestado em 8pt (V5-fix-1, DEC-179) e o "Gerar DOCX"
  salvando o texto em edição antes de gerar (V5-fix-2, DEC-180).
- `plan-v6/` nasce da leitura da interface real contra as referências da skill
  `displayquest-ui` (`.opencode/skills/displayquest-ui/`) e foi **revisado em 2026-10-14**,
  depois do plan-v5. Além da linguagem visual, o plano redistribui **o que aparece em cada
  página**: relatórios unificados na página de Relatórios (DEC-181), aba Voluntários para o
  Painel Administrativo (DEC-182), as 5 abas do detalhe do projeto (DEC-183) e a saída da
  aba `settings` do admin (DEC-184). As **quatro perguntas abertas foram respondidas pelo
  dono** em 2026-10-14 (DEC-185..188: a rota de Relatórios não muda; a aba Dashboard de
  Projetos passa à chave `DASHBOARD_PROJECT_MANAGER` — era bug; nomes de terceiros em tela
  de gestão ficam fora do escopo; título do navegador por tela, por efeito no cliente), então
  o plano **não executa onda com pergunta em aberto**. É **spec-driven** (`SPEC.md` = fonte de verdade do
  comportamento, `PLAN.md` = ordem, `STATE.json` = andamento), só mexe em apresentação e
  navegação — **sem** migrar para RSC —, e cobre **todas as telas** em 13 ondas revertíveis
  (V6-0..V6-11, com V6-6a/V6-6b), contínuas da numeração global (DEC-105..114 e
  DEC-181..188). Ilustrações/texto manuscrito ficaram fora (DEC-109); tema escuro passa a ser
  coberto na skill (DEC-110). A ferramenta de execução é `/ui-refactor <tela>` com gate
  `/ui-review <tela>`.
- `plan-v7/` nasce da demanda do dono em 2026-10-15: um servidor **MCP**
  (Model Context Protocol) que os agents do laboratório usam para falar com o DisplayQuest,
  consumido pela coordenação através de outro projeto. Não vem do `spec-v2` (que já previa
  SSO/LDAP, mas não MCP): vem de uso, como o plan-v3. O achado que dimensiona o plano é que
  **não existe hoje nenhum caminho de credencial** no app — `requireApiActor()`
  (`lib/auth/api-guard.ts`) lê só cookie de sessão, são 260 chamadas em `app/api/` e não há
  modelo de token no schema —, então a peça 1 (V7-1) é a credencial delegada `api_credentials`
  com emissão por CLI, e o MCP é a peça 2 (V7-2 em diante). Escopo completo em seis famílias
  (`read`, `tasks`, `project`, `hours`, `documents`, `people`), 59 tools sobre rotas medidas,
  transporte duplo (Streamable HTTP + `stdio`), TLS no endpoint do MCP, auditoria em tabela e
  um contrato plugável para o IdP futuro. Decisões **DEC-190..203**, perguntas **ASK-V7-01..15**
  (todas respondidas em 2026-10-15; nenhuma aberta), 12 ondas revertíveis
  (V7-0..V7-11). É **planejado** — nenhuma onda começou.

## Regras do container

- Cada subpasta decide seu próprio processo e estado; este README não sobrepõe nada.
- Caminhos relativos aos subfolders permanecem válidos; referências externas a
  `plan-v2`/`spec-v2`/`clean-arch`/`plan-v3` na raiz do repo passam a apontar para
  `displayquest-v2/<subpasta>/`.
- Documentação fora deste container (`docs/`, `AGENTS.md`) referencia o caminho atual
  quando houver menção.
- Toda subpasta de plano mantém `PLAN.md` + `STATE.json`. O `STATE.json` é a fonte de
  verdade do andamento: batch não entra em `done` com gate vermelho ou lacuna aberta de
  que ele mesmo dependa.
