# plan-v5 — domínio de projetos maduro: cronograma, pontos, relatórios técnicos, atestados

> Demanda do dono em 2026-10-06: amadurecer o domínio de projeto — que hoje é básico
> (nome, descrição, líder, status) — para o desenho completo: dados de edital/processo,
> período de execução, entregáveis, anexos, equipe estendida, cronograma (metas +
> atividades ligadas a tasks), pontos de projeto, relatórios técnicos com rascunho por IA,
> e atestados de frequência mensais com AcroForm. **Refinamento em 2026-10-07**, depois do
> encerramento do plan-v4 (subtasks prontas): hierarquia Atividade → Tasks → subtasks,
> cronograma dentro do wizard de criação, logo/banner de projeto e banner de usuário, e
> **bucket S3-compatible** como destino de todos os blobs novos (a medição escolheu MinIO;
> a execução do V5-1 trocou por **SeaweedFS** — DEC-131).
>
> Formo herdado do plan-v3/plan-v4: **medição primeiro, decisões registradas (DEC-99+,
> continuidade da numeração global), um commit revertível por batch, gates G0–G6.**
> **Nada aqui está executado.** O plan-v4 fechou em 2026-10-07 (DEC-78..98), então o
> bloqueio de execução do DEC-73 está cumprido.

## 1. O que foi medido (2026-10-06 e 2026-10-07, antes de planejar)

### 1.1 Projetos hoje — base estreita, mas com wiring pronto

| Fato | Evidência |
|---|---|
| `projects` tem só `name`, `description?`, `createdAt` (String), `createdBy`, `leaderId?`, `status`, `links?` | `prisma/schema.prisma:50-66` |
| `project_members` tem `projectId`, `userId`, `joinedAt`, `roles UserRole[]` (único por par) — **não** tem lattes/carga/matrícula/categoria | `prisma/schema.prisma` (`project_members`) |
| Módulo `project-management` completo (create/update/delete/list/get + ACL) e `project-membership` (add/remove/leader/roles) já existem na clean-arch | `backend/modules/project-management/`, `backend/modules/project-membership/` |
| ACL de gestão congelada: `GLOBAL_PROJECT_MANAGERS = [COORDENADOR, GERENTE]`; membership `GERENTE_PROJETO` também gere | `backend/domain/project/project-rules.ts` |
| 11 rotas `/api/projects/*` já operam via `getBackendComposition()` | `app/api/projects/**` |
| UI de projeto: lista, dialog criar/editar, detail com tabs, gestão de membros — **header do detail é só nome + badge + data** (sem imagem) | `components/features/project-*.tsx`, `components/ui/project-detail-dialog.tsx:136-172` |

**Conclusão:** estender `projects`/`project_members` é o caminho de menor atrito (DEC-61).

### 1.2 Pontos — regra de tarefa mudou no plan-v4; saldo continua só de usuário

| Fato | Evidência |
|---|---|
| Único saldo persistido é `users.points` (Int); "pontos de projeto" atual é a **soma dos points dos membros** (mistura pontos de loja) | `prisma/schema.prisma`; `backend/domain/project/project-rules.ts:294,312` |
| Regra ATUAL (DEC-97,2026-10-06): base `10 + 5·n_subtasks_concluídas` (`POINTS_PER_TASK=10`, `SUBTASK_POINTS=5`), **×1,5 só com ≥2 dias civis de antecedência** (`EARLY_DELIVERY_MIN_DAYS=2`, `Math.round`), atraso `−10/dia` **sem piso** (DEC-39) | `backend/domain/task/points-rules.ts:26-96` |
| O prêmio chega ao cliente na resposta (`awardedPoints`) de `complete-task`/`approve-task` e é publicado via port `onTaskCompleted` (falha de award nunca quebra a conclusão) | `complete-task.use-case.ts:200-206`, `internal/task-view.ts:135` |
| Permissão já sofisticada: `isCompletePermissionDenied`, `isLeaderSelfCompleteDenied`, `approvalDecision` (self → "Líder não pode aprovar a própria tarefa") | `backend/domain/task/task-rules.ts:337-367` |

**Conclusão:** a economia de **usuário** está fechada e madura; a de **projeto** é nova e
tem escala própria (centenas) — DEC-103/104.

### 1.3 Cronograma — não existe; tasks ainda não ligam a atividade

`grep -rn "cronograma"` em `*.ts`/`*.tsx`: **0 ocorrências**. `tasks` liga ao projeto só
por `projectId Int?` (`schema.prisma:87,98`) e **não tem `activityId`**. Não há tabela de
atividade, meta, período de atividade, nem prêmio de atividade.

### 1.4 Relatórios — dois modelos já vivem lado a lado; o técnico é o terceiro

- `project_reports` (projeto + período, texto, anexos) com painel/dialog/print — **continua**.
- `weekly_reports` (usuário + semana) — fonte de dados de frequência dos atestados,
  junto de `work_sessions`.
- Relatórios técnicos (parcial / técnico-final / final) são um model **novo ao lado** (DEC-70).

### 1.5 Notificações — sem canal de urgência

`notifications`: `userId`, `type`, `title`, `message`, `data`, `read` — **sem prioridade**
(`prisma/schema.prisma:408-420`); polling de 60s no cliente; três caminhos de destinatário
prontos (`USER_IDS`, `findReportManagers`, `ALL_ACTIVE_USERS`).

### 1.6 Cron — node-cron com 3 jobs; dia 19 e varredura de atraso são os 4º e 5º

`lib/services/cron-service.ts` já agenda weekly reset (`0 0 * * 1`), pausas agendadas e o
sweep noturno 23:59.

### 1.7 Subtasks prontas (plan-v4, encerrado em 2026-10-07) — a hierarquia nova

| Fato | Evidência |
|---|---|
| `task_subtasks` existe (sem FK para users, sem prazo próprio) | `prisma/schema.prisma:141-152` |
| Trava da mãe (não entra em `in-review`/`done` com subtask aberta) = 400; janela de edição = 409; última subtask concluída auto-move a mãe | DEC-82/83, AGENTS.md |
| Régua de antecedência NOVA passou a valer para toda tarefa (≥2 dias → ×1,5) | DEC-97 (ver 1.2) |
| **As tasks passam a ser as "subtasks" de uma Atividade do cronograma** (pedido do dono 2026-10-07): Atividade → Tasks → subtasks. A trava da atividade espelha a da mãe (DEC-99) | decisão D-R |

### 1.8 Blobs hoje — dois roots em disco, zero infra S3

| O que | Root | Seam |
|---|---|---|
| Avatares | `public/uploads/avatars/<id>/avatar_<ts>.webp` (sharp → webp 300×300) | `lib/utils/image-processor.ts` |
| Anexos de relatório | `data/uploads/reports/<reportId>/<uuid>.<ext>` (≤20 MB, allowlist de 16 mimes + magic bytes) | `lib/storage/report-uploads.ts` |

- Servidas por `/api/uploads/avatars/...` e `/api/report-files/[...path]` (regra de acesso
  do relatório); Dockerfile só torna graváveis `/app/public/uploads` e `/app/data/uploads`
  (gotcha A11).
- `docker-compose.yml` tinha **só `postgres` e `app`**; grep por `minio|@aws-sdk|s3` → 0 na
  medição (o V5-1 mudou isso: passa a achar os três); `sharp` era a única dependência de
  mídia; nenhum limite de corpo configurado no Next.

**Conclusão:** nenhum serviço de objeto existia; o bucket entra como serviço novo + seam
própria, sem tocar nos dois roots legados na primeira leva (DEC-101). O **V5-1** executou
isso, e o nome do servidor mudou no caminho: MinIO → **SeaweedFS** (DEC-131).

### 1.9 Telas de imagem — avatar existe; banner e logo, não

- Perfil: `dashboard/profile/page.tsx:140-148` mostra `user.avatar` (campo `users.avatar`).
- Quadro de liderança: `dashboard/leaderboard/page.tsx` — top-3 por pontos, **#1 já ganha
  `h-24` + borda dourada + `Trophy`**, mas só avatar (sem banner/fundo).
- Detalhe do projeto: **nenhuma imagem** (`project-detail-dialog.tsx:136-172`).

### 1.10 Colisão com o plan-v4 resolvida e baseline

- plan-v4 **encerrado em 2026-10-07** (V4-1..V4-5d, V4-6b, POS-1; DEC-78..98) → o
  bloqueio "executa depois do plan-v4" (DEC-73) está **cumprido**.
- **Numeração:** DEC-61..77 = este plano (2026-10-06); DEC-78..98 = plan-v4;
  DEC-99..104 = este plano (2026-10-07); DEC-105..114 = plan-v6; DEC-115..125 =
  clean-arch (B6-restante + B9/B10). **Próxima livre na época: DEC-126** (hoje, depois de
  DEC-126..131, a livre é a DEC-132).
- **Baseline medido em 2026-10-09 (dev):** G0 `arch:check` **822 módulos / 3370
  dependências, zero violação, allow-list vazia**; G3 **101 arquivos / 1323 testes
  verdes**. Referências: 87/1107 (2026-10-07) e 95/1280 + 105/1367 na branch
  `refactor/b6-restante` (2026-10-08). e2e do quadro segue **2 passando + 1 falha
  conhecida + 5 "did not run"**; shell **5 passando**.
- **O repo-cleanup encerrou em 2026-10-08** (B0..B10, DEC-115..125): as 41 rotas do D4
  migraram para decisão no use case com `ActorRef`. A caveat "se plan-v5/v6 iniciar
  antes do B6 terminar, re-medir as listas dos lotes afetados" **expirou** com o B6;
  as ondas novas tocam rotas já migradas (`projects`, `tasks`, `notifications`) e
  seguem o padrão pós-B6 descrito em §5.
- **Baseline re-medido em 2026-10-13 (dev, HEAD `76efcc2`):** G0 **822 módulos / 3370
  dependências, zero violação, allow-list vazia**; G3 **101 arquivos / 1323 testes**;
  suíte completa com o banco de teste no ar **111 arquivos / 1410 testes** (10 arquivos
  de integração / 87 testes). Sem `dq-dev-test-db` no ar a completa dá
  "10 failed / 15 failed" — é ambiente, não regressão (o container estava parado).

### 1.11 Templates oficiais medidos (2026-10-13, `docs/Projeto/`)

O dono colocou os dois documentos oficiais em `docs/Projeto/` (diretório **gitignored**,
linha 185 do `.gitignore`; `IDEIA.md` ali está depreciado). Medidos byte a byte:

**`[template] - Relatório Técnico.docx`** (24 KB, OOXML): cabeçalho institucional
(Ministério/SETEC/IFNMG + logo em `word/media/image1.png`), título "Relatório de
Atividades de Iniciação Científica", a linha **`( ) Relatório Final (  ) Relatório
Parcial`** como texto literal (não é campo de formulário), e **7 tabelas**: período
("De ____/____/______ a ____/____/______"), projeto (Título, **Nº de cadastro na
PROPPI**, Coordenador, Campus "Januária", Duração Início/Término), orientador (Nome,
Campus), **estudante** (Nome / Curso / Modalidade de I.C. / Instituição de Fomento —
uma linha só, hoje preenchida com o exemplo "Guilherme de Araújo Carneiro / Bel em
Sistemas de Informação"), e **3 tabelas vazias** que são as áreas de texto:
Descrição das Atividades (etapa/cronograma), Principais Resultados Alcançados,
Comentários Adicionais. Rodapé: Data + "assinado eletronicamente pelo Orientador".
Formatação medida: **todos os runs de corpo são Times New Roman 12** (`w:sz w:val="24"`,
120 ocorrências), `docDefaults` é Calibri 11 mas os runs sobrescrevem; margens
2 cm (top/bottom 1134 twips) e 1,9 cm (left/right 1080) — **não são as margens ABNT
de 3/2 cm**; sem espaçamento 1,5 fixo. Campos a preencher são **sublinhados literais
dentro do próprio run**.

**`[template] - ANEXO IV - Atestado de Frequência Bolsista ou Voluntário.pdf`**
(142 KB): **AcroForm real, 42 campos nomeados** (`/AcroForm 210 0 R`, `NeedAppearances
true`, `/DA /Times`): `data`, `edital`, `titulo`, `coorientador`, `nome`, `CPF`,
`matricula`, `nivel_medio`, `nivel_graduacao`, `nivel_pos-graduacao`, `carga_8`,
`carga_20`, `carga_adaptada`, `horas_adaptada`, `is_bolsista`, `se_bolsista`,
`is_pibic`, `is_pibic-jr`, `is_pibic-af`, `is_pibiti`, `is_pibiti-jr`, `is_btp`,
`is_mestrado`, `is_doutorado`, `is_pos-doc`, `is_ifnmg`, `is_cnpq`, `is_fapemig`,
`is_outra`, `is_voluntario`, `agencia_outra`, `atividades_1`, `atividade_2`,
`status_nao-iniciado`, `status_atrasado`, `status_como-previsto`, `status_adiantado`,
`status_concluido`, `justificativa`, `dia`, `mes`, `ano`. Tipos `/FT /Tx` e `/FT /Btn`
(checkboxes, todos `/AS /Off`). Não tem XFA. **Consequência:** a DEC-71 ("o sistema
GERA o AcroForm") está superada pela realidade — o formulário oficial já existe com
campos nomeados; o sistema **preenche**.

> **Correção medida em 2026-10-13 (V5-1a):** a DEC-130 e este parágrafo diziam "39 campos".
> A contagem estava errada — a enumeração acima sempre teve 42 nomes. Medido com
> `@cantoo/pdf-lib`: **16 `/FT /Tx` + 26 `/FT /Btn` = 42**. A lista congelada, na ordem do
> arquivo, vive em `tests/unit/scripts/report-templates-drift.test.ts`.

**Medido no V5-1a (2026-10-13), ao virar asset:**

- **sha256** — DOCX `70a81240a7de5a661f280b89f2270b3bfb3f1c67048c92882b19e10ce3841f75`,
  PDF `ecba85390adbeaf6559652febea281d7c18ea535c0a94dbfff77d615f9b41757`. São os dois
  valores congelados no guarda de deriva.
- **21 ocorrências** de `___+` em `word/document.xml` (o único part que muda). **Todos os
  brancos moram num único run** de Times New Roman 12, então reescrever o texto do run
  dentro do próprio `<w:t>` preserva `w:rPr` sem tocar em estilo nenhum.
- **`listCommands` só enxerga `{{campo}}` com `cmdDelimiter: ['{{','}}']`.** Medido: o
  default é `+++` (acha zero comandos) e `['{','}']` **quebra** a chave dupla em dois
  comandos vazios. O par ancorado vive em `CMD_DELIMITER`, em
  `scripts/tag-report-template.mjs`, e o preenchimento do V5-9 tem que passar o mesmo.
- **13 comandos** na ordem do documento: `periodo_inicio`, `periodo_fim`, `titulo`,
  `proppi`, `coordenador`, `projeto_inicio`, `projeto_termino`, `orientador`,
  `estudante_nome`, `estudante_curso`, `modalidade`, `instituicao_fomento`,
  `data_relatorio`.
- **Os dados de exemplo não sobrevivem à cópia marcada:** "Guilherme de Araújo Carneiro" e
  "Bel em Sistemas de Informação" viram `{{estudante_nome}}`/`{{estudante_curso}}`. Um nome
  real não pode sair em documento entregue. O "quantos relatórios por projeto" foi respondido
  em 2026-10-13 (**DEC-139**): um registro por projeto × tipo, e o DOCX é gerado uma vez por
  membro a partir do mesmo texto.
- **Fora do V5-1a, de propósito:** a linha de tipo (`( ) Relatório Final (  ) Relatório
  Parcial`) e as 3 tabelas vazias continuam sem marcação — são trabalho do V5-9, e quando
  ele acrescentar comandos a lista congelada no guarda cresce junto.

**Biblioteca, medido no registry em 2026-10-13:** `pdf-lib` 1.17.1 é MIT mas **último
release em 2021-11-06** (5 anos sem publicação); o fork mantido `@cantoo/pdf-lib`
2.11.1 (MIT, 2026-09-15) tem a mesma API (`getForm`, `getTextField`, `getCheckBox`,
`updateFieldAppearances`, `flatten`). Para DOCX: `docx-templates` 4.15.0 (MIT,
2025-12-03, dependências só `jszip` + `sax`) preenche um template existente com
`INS`/`FOR`/`IF`, aceita `FOR` sobre **linha de tabela**, `processLineBreaks` para
texto multilinha, e expõe `listCommands()` — que serve de guarda para o inventário de
campos. `docxtemplater` 3.71.0 (2026-09-21) é alternativa, mas imagem/tabela/html são
módulos pagos.

**O que os dois documentos exigem e o schema não tem hoje** (medido em
`prisma/schema.prisma`): `CPF`, `matrícula`, `curso`, **modalidade de IC**
(BIC/BIC-Jr/BITI/ICV), **instituição de fomento** (CNPQ/FAPEMIG/outra), nível
(médio/graduação/pós), **nº PROPPI**. `users` tem nome, email, points, avatar, bio;
`project_members` tem só `projectId`, `userId`, `joinedAt`, `roles`. Respondido em
2026-10-13 (**DEC-138**, **DEC-140**): os seis campos de pessoa vão em `users`, o nº PROPPI
vai em `projects.proppiNumber`, e a carga horária é coluna do vínculo
(`project_members.cargaHoraria`) — não deriva de `users.weekHours`.

## 2. Decisões do dono

### 2.1 Rodada de 2026-10-06 (D-A..D-Q → DEC-61..77)

| # | Pergunta | Escolhida | DEC |
|---|---|---|---|
| D-A | Schema novo vs estender | Estender `projects`/`project_members` | **DEC-61** |
| D-B | Escopo do plano | Tudo, em ondas independentes e revertíveis | **DEC-62** |
| D-C | Origem dos pontos de projeto | Campo próprio `projects.points` | **DEC-63** |
| D-D | Forma da notificação urgente | In-app com prioridade/destaque | **DEC-64** |
| D-E | Provider de IA | Modelo local do lab, OpenAI-compatible, por env genérica | **DEC-65** |
| D-F | Certificate × relatório de frequência | Certificate = atestado com AcroForm; Reports = artigos | **DEC-66** |
| D-G | Fórmula da premiação da atividade | Reusar `points-rules` — **superada por DEC-103** | **DEC-67** |
| D-H | Divisão entre membros | Integral — **superada por DEC-104** | **DEC-68** |
| D-I | Member × `project_members` | Estender `project_members` | **DEC-69** |
| D-J | Relatório técnico liga a quê | Por projeto + tipo | **DEC-70** |
| D-K | AcroForm na v1 | Sistema gera e valida (pdf-lib) | **DEC-71** |
| D-L | Lembrete dia 19 | Coordenadores/gerentes + líderes | **DEC-72** |
| D-M | Relação com o plan-v4 | plan-v5 espera o plan-v4 — **cumprido em 2026-10-07** | **DEC-73** |
| D-N | Piso dos pontos de projeto | **Piso em 0** (usuários seguem sem piso, DEC-39) | **DEC-74** |
| D-O | Status do atestado | **Não implementar** — status do projeto cobre | **DEC-75** |
| D-P | Quem conclui/aprova atividade | Duas fases: líder/gerente de projeto **solicita** com provas; gerente/coordenador **aprova** | **DEC-76** |
| D-Q | Solicitante aprova a própria? | **Só se for COORDENADOR**; GERENTE não | **DEC-77** |

### 2.2 Rodada de 2026-10-07 (D-R..D-W → DEC-99..104), após o encerramento do plan-v4

| # | Pergunta | Escolhida | DEC |
|---|---|---|---|
| D-R | Atividade com task pendente pode ser concluída? | **Trava**: só solicitar conclusão com **todas** as tasks da atividade prontas (análogo à trava da mãe, DEC-82). Tasks = subtasks da atividade | **DEC-99** |
| D-S | Cronograma na criação do projeto | **Passo opcional no wizard** (dados → equipe opcional → cronograma opcional → cria); pula e monta depois no detail | **DEC-100** |
| D-T | Escopo do bucket | **Bucket desde o começo** (V5-1) para **todos** os blobs novos do plano, atrás de port/seam; migração dos existentes (avatares, anexos) fica para depois. Vídeo: **só infra preparada** (mimes no allowlist), nenhuma tela de vídeo no plan-v5. (O *servidor* nomeado aqui — MinIO — foi substituído por SeaweedFS na execução: **DEC-131**; o escopo desta linha não mudou) | **DEC-101** |
| D-U | Imagens | Projeto ganha **logo + banner** (página/detalhe estilo Facebook/LinkedIn); usuário mantém o **avatar** (existe) e ganha **banner novo**; o **top #1 do quadro** ganha o tratamento com as imagens, e o perfil mostra as duas | **DEC-102** |
| D-V | Escala e peso da economia de projeto | Base da atividade = **100 × meses de duração** (ex.: 3 meses → 300); atraso = **fração da recompensa por dia (−10%/dia)** — muito mais pesado que os −10/dia do usuário; piso 0 (DEC-74); antecedência ×1,5 com ≥2 dias (régua DEC-97). Tasks continuam premiando **indivíduos**; a atividade premia **os membros ativos do projeto** | **DEC-103** |
| D-W | Distribuição aos membros | **Proporcional às tasks que cada membro concluiu no projeto** (pool = membros ativos; sem tasks → 0). Substitui a divisão integral da DEC-68 | **DEC-104** |

Registro longo (com alternativas e consequências) está no `STATE.json` → `decisionRegistry`.

### 2.3 Rodada de 2026-10-09 (D-X → DEC-126)

| # | Pergunta | Escolhida | DEC |
|---|---|---|---|
| D-X | Como converter a duração em meses | **Não se converte**: o cronograma é uma tabela (colunas = meses, linhas = atividades), o usuário **marca os meses** que a atividade ocupa, sem meia-mês. Recompensa = 100 × meses marcados | **DEC-126** |
| D-Y | Quem pode ver projetos | **Todo usuário autenticado vê todos**, na lista e no detalhe (backlog 2026-10-09); escrita/gestão segue a ACL atual | **DEC-127** |

### 2.4 Rodada de 2026-10-13 (D-Z..D-AB → DEC-128..130), documentos oficiais

O dono entregou os templates e delegou a análise ("analisa como você vai lidar com a
escrita... adapte os planos"). As três escolhas abaixo saem da medição de §1.11; o dono
pode reverter cada uma.

| # | Pergunta | Escolhida | DEC |
|---|---|---|---|
| D-Z | Onde vivem os templates oficiais | `docs/Projeto/` é gitignored e é a **caixa de entrada do dono**; os arquivos que o app usa viram **asset versionado** em `templates/` no repo, lidos do sistema de arquivos da imagem (rota de leitura, sem escrita nova em disco) | **DEC-128** |
| D-AA | Como escrever no DOCX sem quebrar a formatação | **Preencher o template oficial**, nunca gerar documento: `docx-templates` escreve texto **dentro dos runs que já carregam** Times New Roman 12; o arquivo oficial fica byte-intacto e uma **cópia marcada** (`{{campo}}`) é derivada por script, nunca editada à mão. O preenchimento **tem que passar `cmdDelimiter: ['{{','}}']`** — o default da biblioteca é `+++` e `['{','}']` quebra a chave dupla (medido no V5-1a) | **DEC-129** |
| D-AB | Como escrever no PDF de atestado | **Preencher o AcroForm oficial** pelos 42 nomes medidos, com `@cantoo/pdf-lib` (fork mantido; `pdf-lib` sem release desde 2021), fonte de aparência Times e `flatten()` no arquivo entregue. **Revoga a parte "gerar o AcroForm" da DEC-71** | **DEC-130** |

### 2.5 Rodada de execução do V5-1 (D-AC..D-AD → DEC-131), servidor do bucket

A execução do V5-1 mediu o que o plano tinha assumido e derrubou o **nome do servidor** que
a DEC-101 escolheu — o escopo dela (bucket desde o começo, atrás de port/seam, allowlist de
imagens/pdf/vídeo, sem migrar os dois roots legados) **continua valendo inteiro**:

| # | Pergunta | Decisão | DEC |
|---|---|---|---|
| D-AC | Qual servidor S3-compatible? | **SeaweedFS** (`chrislusf/seaweedfs`), em modo `mini` (master + volume + filer + S3 num processo, o modo que o próprio entrypoint da imagem usa), pinado por **digest** porque só existem as tags `latest`/`dev` (nenhum semver). O MinIO está **EOL** — repo arquivado em 2026-04-25 (EOL fev/2026) e as imagens oficiais saíram do Docker Hub, do `quay.io` e do `ghcr.io`: `docker manifest inspect` falha nos três, medido em 2026-10-13 | **DEC-131** |
| D-AD | Nomes das variáveis de ambiente | **`S3_*`** (`S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION`, `S3_FORCE_PATH_STYLE`), não `MINIO_*` — o seam é do **protocolo**, não do servidor, e o servidor já mudou uma vez. `S3_ACCESS_KEY`/`S3_SECRET_KEY` são obrigatórios no compose (`${VAR:?}`) e entram no `npm run check:env` | **DEC-131** |

### 2.6 Rodada de alinhamento de 2026-10-13 (D-AE..D-AN → DEC-138..146), antes do V5-4

O dono pediu para alinhar **todas** as perguntas abertas antes de o plano continuar. As duas
do plan-v5 (`ASK-V5-06`, `ASK-V5-07`) e quatro decisões que estavam abertas em outros registros
(GAP-05 e GAP-06 do clean-arch, o seam órfão do plan-v3, a largada do plan-v6), mais dois
achados que eu medi e não tinham ASK escrito.

| # | Pergunta | Escolhida | DEC |
|---|---|---|---|
| D-AE | Onde vivem CPF, matrícula, curso, modalidade de IC, instituição de fomento e nível? | **Tudo em `users`** — dado da pessoa, não do vínculo. Custo aceito e registrado: modalidade e fomento deixam de poder mudar de projeto para projeto | **DEC-138** |
| D-AF | Quem escreve esses campos, e quem lê o CPF? | Escrevem a **própria pessoa e a gestão** (o gate do perfil, `self` OU `MANAGE_USERS`). **CPF** é o único com leitura restrita (próprio + gestão); curso, modalidade, fomento e nível seguem a leitura aberta do perfil | **DEC-138** |
| D-AG | O relatório técnico é por projeto ou por participante? | **Por projeto × tipo** (a DEC-70 fica), e o DOCX é **gerado N vezes**, um por membro, a partir do mesmo texto | **DEC-139** |
| D-AH | Carga horária: coluna nova no vínculo ou `users.weekHours`? | **Coluna nova** (`project_members.cargaHoraria`), e é ela que entra no atestado. `users.weekHours` continua a meta semanal da pessoa. Nº PROPPI é `projects.proppiNumber` | **DEC-140** |
| D-AI | GAP-05: os status pré-contrato em `tasks.status` (14 de 18 tasks na 5432)? | **Migration de cleanup**, sem constraint na coluna | **DEC-141** |
| D-AJ | GAP-06: `backend/models/` — adotar nos demais módulos ou encolher? | **Encolher** para o que é usado: 13 arquivos medidos, 6 com importador (todos do lab-operations), 7 sem importador nenhum saem | **DEC-142** |
| D-AK | "Visibilidade do Perfil" é gravada e documentada, mas nenhuma decisão a lê. O que fazer? | **Implementar a regra** de leitura — batch novo **V5-12** | **DEC-143** |
| D-AL | O seam órfão `lib/notifications/browser-notifications.ts` (plan-v3 §8) fica ou sai? | **Sai**, junto com o teste dele | **DEC-144** |
| D-AM | Quando começa o plan-v6 (`awaitingInstruction` aberto)? | **Depois de o plan-v5 fechar**, inclusive as ondas livres V6-0..V6-3 | **DEC-145** |
| D-AN | `next@15.2.4` tem CVE conhecida (CVE-2025-66478). Atualizar? | **Registrar e decidir depois**, com janela para rodar os gates completos; fora do roteiro do plano | **DEC-146** |

## 3. Mapeamento do domínio pedido → onde vive

| Pedido no domínio | Hoje | Depois do plan-v5 |
|---|---|---|
| `Projeto.título` | `projects.name` | fica |
| `Projeto.início/término` | — | `projects.startDate?/endDate?` |
| `Projeto.nº Edital`, `nº processo` | — | `projects.editalNumber?/processNumber?` |
| `Projeto.pontos` | inexistente (só agregado de tela) | `projects.points Int @default(0)` (piso 0 na escrita, DEC-74) |
| `Projeto.relatorios Report[ ]` | `project_reports` (outro conceito) | novo `technical_reports` (projeto × tipo) |
| `Projeto.atestados Certificate[ ]` | — | novo `certificates` (sem status próprio, DEC-75) |
| `Projeto.cronograma` | — | `project_goals` + `project_activities`; **também no wizard de criação** (DEC-100) |
| `Projeto.anexos Blob[ ]` | — | `project_attachments` → **bucket** (DEC-101; servidor = SeaweedFS, DEC-131) |
| `Projeto.entregáveis Deliverable[ ]` | — | `project_deliverables (name, quantity)` |
| logo/banner do projeto | não existe | `projects.logoKey?/bannerKey?` no bucket; header do detail + lista (DEC-102) |
| `Projeto.equipe Member[ ]` | `project_members` | estendido: `lattes`, `cargaHoraria`, `categoria`, `situacao`, `dataEntrada` (matrícula **não**: vai em `users`, DEC-138) |
| dados de pessoa (CPF, matrícula, curso, modalidade, fomento, nível) | não existem | `users.cpf?`, `users.registrationNumber?`, `users.course?`, `users.scholarshipType?`, `users.fundingAgency?`, `users.fundingAgencyOther?`, `users.level?` (DEC-138; nomes gravados no V5-4a, com as listas fechadas derivadas do AcroForm — DEC-147). CPF com leitura restrita |
| `Projeto.nº PROPPI` | — | `projects.proppiNumber?` (DEC-140) |
| banner do usuário | só avatar (`users.avatar`) | `users.bannerKey?` no bucket; perfil + pódio #1 (DEC-102) |
| `Certificate.template Blob` | — | AcroForm gerado (pdf-lib) → bucket |
| `Activity.task Task[ ]` | **não existe** | `tasks.activityId?` + trava DEC-99 (todas prontas p/ solicitar) |
| `Activity.recompensa` | — | **100 × meses marcados na grade** (colunas = meses, linhas = atividades; DEC-126); período derivado dos limites dos meses marcados |
| `Activity.prova Blob[ ]` | — | bucket (`projects/<id>/activities/<id>/`) |
| `Member.usuario` | `project_members.userId` | fica |
| qualquer blob novo | disco do container | **bucket** (DEC-101/DEC-131) — nenhum `writeFile` novo fora do bucket |

`Report` (3 tipos) vira **3 registros por projeto**, um por tipo (DEC-70), cada um com
`content` + `file`.

## 4. Sequência proposta (cada linha = 1 commit revertível)

| Batch | O que faz | Risco | Status |
|---|---|---|---|
| **V5-1** | **Bucket + seam de blob** (DEC-101/DEC-131): serviço `seaweedfs` no compose em modo `mini`, pinado por digest, com a identidade S3 escrita a partir de `S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET` (nada de credencial no repo), porta 8333 intra-rede (+ 8333/8888 em loopback no override), volume `object_store_data`, healthcheck no master; envs `S3_*`; dependência `@aws-sdk/client-s3`; seam `lib/storage/blob-store.ts` + port `BlobStorePort` + adapter `s3-blob-store.ts` (allowlist de imagens/pdf/**vídeo**), sem consumidor de produção ainda | baixo — infra nova, zero mudança de comportamento | **done** (2026-10-13) |
| **V5-1a** | **Templates oficiais viram asset** (DEC-128): copia os dois arquivos de `docs/Projeto/` para `templates/` (versionado), `COPY` no Dockerfile (leitura só, sem caminho de escrita novo), script `scripts/tag-report-template.mjs` que deriva `templates/relatorio-tecnico.tagged.docx` trocando os sublinhados literais por comandos `docx-templates` **dentro do mesmo run**, e **guardas de deriva**: sha256 dos dois oficiais + inventário dos 42 nomes do AcroForm + `listCommands()` da cópia marcada + a cópia tem que ser exatamente o que o script deriva. `docx-templates` 4.15.0 e `@cantoo/pdf-lib` 2.11.1 entram **aqui** (as guardas precisam delas), e não no V5-9/V5-10 como o §5 previa. Zero mudança de comportamento | baixo — asset + testes de guarda | **done** (2026-10-13) |
| **V5-2** | **Dados do projeto + imagens**: migration (`startDate`, `endDate`, `editalNumber`, `processNumber`, `points`, `logoKey?`, `bannerKey?`) + `project_deliverables` + anexos **no bucket** + **logo/banner do projeto** com upload (validação de imagem) + header do detail com banner/logo (estilo FB/LinkedIn) | médio — tela visível (G5/G6) | **dividido a pedido do dono (2026-10-13)** em V5-2b / V5-2c / V5-2d |
| **V5-2b** | **Dados do projeto**: migration nullable (`startDate`, `endDate`, `editalNumber`, `processNumber`, `points @default(0)`) + regras puras (data civil, período invertido recusado, `points` não escrevível pela rota) + port/adapter/use cases + POST/PUT + campos no diálogo criar/editar + card "Dados do projeto" no detail | baixo — migration aditiva + formulário | **done** (2026-10-13) |
| **V5-2c** | **Entregáveis + anexos**: `project_deliverables` (name, quantity) + `project_attachments` com blob **no bucket** (primeiro consumidor do seam, magic bytes na seam, env `S3_*` no serviço `app`). CORREÇÃO DE ROTEIRO medida na execução (DEC-133): o `BlobStorePort` **não** foi ligado no composition root — quem move byte é a rota pelo seam, e o módulo guarda só registro + autorização, assim os use cases e o roundtrip G4 rodam sem bucket no ar | médio — bucket vira consumidor de produção | **done** (2026-10-13) |
| **V5-2d** | **Logo + banner do projeto**: `logoKey?`/`bannerKey?` guardando a **chave** do bucket, upload validado (slot de lista fechada, **só imagem** — mime decidido pela seam, ≤5 MB, magic bytes), rota de leitura autenticada com a regra de acesso do projeto, header do detail estilo Facebook/LinkedIn. Fecha **G5/G6 da família** (recaptura única de `projetos`, `dialogo-novo-projeto`, `dialogo-detalhe-projeto`) | médio — tela visível (G5/G6) | **done** (2026-10-13) |
| **V5-2a** | **Visão de todos os projetos**: lista (`GET /api/projects`) e detalhe (`GET /api/projects/[id]`) passam a aceitar qualquer autenticado (DEC-127); escrita/gestão intacta; filhos (anexos, horas, cronograma) seguem a mesma leitura; ajusta os 2 trechos do roundtrip que congelam a regra antiga e escreve os testes unitários que faltam (`ListProjectsForActorUseCase`, `canActorAccessProjectDecision`) | baixo — 1 ACL + testes; roteiro para o V6-5 | **done** (2026-10-13; DEC-136: o escopo medido era maior — Membros e `/volunteers` abertos a pedido do dono, gate de leitura removido das 3 rotas de horas, e 6 assertions congeladas trocadas, não 2) |
| **V5-3** | **Banner de usuário + pódio**: `users.bannerKey?`, upload no perfil, perfil mostra avatar+banner, **top #1 do quadro** ganha o tratamento com as imagens (avatar `h-24` já existe; entra o banner/fundo) | médio — tela visível (G5/G6) | **done** (2026-10-13, DEC-137) |
| **V5-4a** | **Dados de pessoa** (metade do V5-4, aberta pela DEC-148): colunas novas em `users` (`cpf`, `registrationNumber`, `course`, `scholarshipType`, `fundingAgency`, `fundingAgencyOther`, `level` — DEC-138) + `projects.proppiNumber` (DEC-140). Escrita pelo gate do perfil (próprio OU `MANAGE_USERS`); **CPF com leitura restrita** a próprio e gestão, os demais seguem a leitura aberta. Telas: seção no formulário de perfil, bloco de leitura no cartão de perfil, campos no diálogo do painel, campo e linha no projeto | baixo — migration aditiva + três telas | **done** (2026-10-13, DEC-147; G5/G6 adiados para o fechamento do V5-4, DEC-148) |
| **V5-4b** | **Equipe estendida**: colunas novas em `project_members` (`lattes`, `cargaHoraria`, `categoria`, `situacao`, `dataEntrada`) + use case de perfil de membro + tela de membros. Roteiro corrigido em 2026-10-13: matrícula saiu do vínculo e entrou em `users` (executado no V5-4a) | baixo-médio — migration aditiva + tela visível (G5/G6) | pendente |
| **V5-5** | **Cronograma**: `project_goals` + `project_activities` (ordem, descrição, responsável, **meses marcados na grade** → recompensa 100×meses e período do primeiro ao último mês marcado, status `OPEN → COMPLETION_REQUESTED → DONE`, provas no bucket), regras puras de período/ordem, **grade meses × atividades** + aba no detail, **wizard de criação com passo opcional de cronograma (DEC-100)** | médio — modelagem nova + tela (G5/G6) | pendente |
| **V5-6** | **Task × atividade**: `tasks.activityId?`, no form a atividade do período atual vem **pré-selecionada** e só dá para escolher futuras, filtro no quadro, e a **trava DEC-99** (solicitar conclusão só com todas as tasks prontas) | médio — mexe no form do quadro (G5/G6) | pendente |
| **V5-7** | **Economia de projeto**: `request-activity-completion` (líder/membro gestor + provas) e `approve-activity-completion` (só `GLOBAL_PROJECT_MANAGERS`; auto-aprova só COORDENADOR — DEC-77); prêmio = `100×meses × (1,5 se ≥2d adiantada) − 10%/dia de atraso`, **piso 0** (DEC-103/74); distribuição **proporcional às tasks concluídas de cada membro** (DEC-104); tarefa concluída de projeto também incrementa `projects.points`; idempotência + histórico | **alto** — economia | pendente |
| **V5-8** | **Atraso urgente**: coluna `priority` em `notifications` + destaque na UI; varredura diária no cron: atividade vencida e não aprovada → **1** notificação prioritária (`overdueNotifiedAt`) para líder + coordenadores/gerentes | médio | pendente |
| **V5-9** | **Relatórios técnicos + IA**: `technical_reports` (projeto × tipo, texto + arquivo no bucket), permissão gestão/líder, `ReportDraftPort` + adapter OpenAI-compatible por env (`AI_BASE_URL/AI_API_KEY/AI_MODEL`, default `http://localhost:8080/v1`), rascunho a partir de **três fontes**: logs de sessão (`work_sessions`), tasks do projeto (status, conclusão, pontos) e atividades do cronograma (meses marcados, provas). Entrega em **DOCX pelo template oficial** (DEC-129): o texto da IA entra **como texto puro** nas 3 tabelas vazias do template (Descrição / Resultados / Comentários), o tipo (parcial/final) marca a linha `( ) Relatório Final ( ) Relatório Parcial`, e o adaptador docx vive em `infrastructure/adapters/` atrás de porta. Escopo **resolvido em 2026-10-13 (DEC-139)**: o registro fica por projeto × tipo como a DEC-70 fixou (sem `userId`, sem tabela de filhos) e a geração é **lote — um DOCX por membro**, preenchendo o bloco "Identificação do Estudante de IC" pessoa por pessoa a partir dos campos de `users` (DEC-138) | médio | pendente |
| **V5-10** | **Atestados**: módulo `attestation` — `certificates` (sem status, DEC-75), **preenche o AcroForm oficial** pelos 42 campos medidos com `@cantoo/pdf-lib` (DEC-130): `nome`/`CPF`/`matricula`/`titulo`/`edital`/`coorientador` do projeto e do membro, checkboxes de modalidade/fomento (`is_pibic`, `is_voluntario`, `is_cnpq`…), carga (`carga_8`/`carga_20`/`carga_adaptada`/`horas_adaptada`) vinda de **`project_members.cargaHoraria`** (DEC-140 — não de `weekly_reports`/`work_sessions`, que são horas registradas, não a carga contratada), `atividades_1`/`atividade_2` + `status_*` vindos do cronograma (V5-5), `dia`/`mes`/`ano` do mês de referência; `updateFieldAppearances(Times)` + `flatten()` no arquivo entregue (bucket). Lembrete dia 19 (`0 9 19 * *`) para coordenadores/gerentes + líderes. Os campos de pessoa **já têm lugar** desde a DEC-138 (`users`), e o nº PROPPI é `projects.proppiNumber` (DEC-140) | médio-alto — dependência nova + PDF (G5/G6) | pendente |
| **V5-11** | **Tela de andamento**: gráfico `data_final − dia_de_hoje` + exibição de `projects.points` (agora real) | baixo | pendente |
| **V5-12** | **Visibilidade de perfil: a regra que o campo promete** (DEC-143): decisão pura no domínio de identidade consumida pela leitura de perfil — `public` é hoje, `members_only` casa por projeto em comum, `private` é próprio + gestão. Regra, rotas e testes; o guia deixa de descrever três valores que o servidor ignora. Achado medido em 2026-10-13: `users.profileVisibility` é gravado, editável na aba Configurações e documentado no guia, e **nenhuma decisão no backend o lê** | baixo-médio — regra nova de leitura (G5/G6 se a tela mudar) | pendente |

Ordem: **V5-1 primeiro** (tudo que gravar blob depende dele) e **V5-1a em seguida** (os
documentos do V5-9/V5-10 leem o asset versionado e as guardas de deriva). V5-2, V5-2a,
V5-3 e V5-4 são independentes entre si (a V5-2a só precisa rodar antes do V6-5 do
plan-v6). V5-5 → V5-6 → V5-7 → V5-8 encadeiam. V5-9 e V5-10 correm quando quiser depois
de V5-1a; o V5-10 também espera V5-5 (atividades e status entram no PDF) e o `ASK-V5-07`
foi respondido em 2026-10-13 (DEC-138), então a migration do V5-4 já tem forma. V5-11
espera V5-2 (`endDate`) e V5-7 (`points`). V5-12 não depende de nada do plano e não é
dependido por ninguém: é o batch de respiro entre dois médios. A espera pelo plan-v4 caiu:
ele fechou em 2026-10-07.

### 4.1 Dívida aprovada na rodada de 2026-10-13 (fora do roteiro do domínio)

Três itens que o dono aprovou e que não são trabalho do domínio do projeto. Cada um é batch
próprio e revertível, e roda entre as linhas do roteiro, sem esperar batch do domínio:

| Item | O que faz | DEC |
|---|---|---|
| **D-1** | **Cleanup dos status pré-contrato** em `tasks.status`: migration que reescreve `pending`/`in_progress`/`completed` para `to-do`/`in-progress`/`done` (14 de 18 tasks na 5432, medido 2026-10-01), aplicada na 5432 e na 5433. Sem constraint na coluna. Depois dela o `console.warn` do `wireTaskSchema` perde o motivo | **DEC-141** |
| **D-2** | **`backend/models/` encolhe**: saem os 7 builders sem importador (Badge, DailyLog, Project, ProjectMembership, Purchase, Reward, Task); ficam os 6 consumidos pelos repositórios do lab-operations. Ajusta o guarda que hoje proíbe o core de importar a camada | **DEC-142** |
| **D-3** | **Seam órfão fora**: `lib/notifications/browser-notifications.ts` (134 linhas) + o teste dele (231 linhas). Zero chamadores medidos | **DEC-144** |

Fora de batch, registrado sem ação: **`next@15.2.4`** tem CVE conhecida (CVE-2025-66478) e o
upgrade é decisão de dependência com janela própria para rodar os gates (**DEC-146**).

## 5. Estrutura de arquivos prevista

> **Padrão pós-B6 (clean-arch encerrado em 2026-10-08):** toda rota nova segue o que as
> 41 rotas do D4 seguiram — a **decisão fica no use case** (que recebe `ActorRef`;
> `requireActorPermission`/`systemActor(reason)` de
> `backend/domain/identity/actor-ref.ts`), a rota autentica, valida entrada e mapeia com
> `domainErrorResponse`/`routeErrorResponse`. Onde o 403 precisa vir **antes** dos 400 de
> corpo, entra um `AssertCan*UseCase` na rota, como fizeram notifications (B6-2b),
> schedules/bulk (B6-6) e POST tasks (B6-7).

```
docker-compose.yml                        +serviço seaweedfs (volume object_store_data, 8333 intra-rede;
                                          127.0.0.1:8333/8888 no override; credenciais por env — DEC-131)
package.json                              +@aws-sdk/client-s3 (e presigner se precisar de URL)
                                          +docx-templates e @cantoo/pdf-lib (entraram no V5-1a, para as
                                          guardas de deriva; são usadas no V5-9/V5-10)
templates/                                (novo, V5-1a) relatorio-tecnico.docx (oficial, byte-intacto),
                                          relatorio-tecnico.tagged.docx (derivado por script),
                                          atestado-frequencia.pdf (AcroForm oficial)
Dockerfile                                COPY templates/ (leitura; nenhum caminho de escrita novo)
scripts/tag-report-template.mjs           (novo, V5-1a) deriva a cópia marcada a partir do oficial
prisma/schema.prisma                      +cols em projects/users/project_members/tasks/notifications
prisma/migrations/                        migrations por batch (nullable; sem backfill)
lib/storage/blob-store.ts                 (novo, V5-1) seam de blob: put/get/remove/allowlist (imgs/pdf/vídeo),
                                          config por env S3_* e cliente S3 injetável
backend/domain/project/
  project-rules.ts                        + regras de período/ordem/atraso (puras)
  activity-rules.ts                       (novo) recompensa = 100×meses marcados, fração −10%/dia, distribuição proporcional
backend/domain/attestation/               (novo) regras de atestado/mês/validação de campos
  attestation-fields-rules.ts             (novo) projeto+membro+horas+atividades → registro {campoAcroForm: valor}, puro
backend/domain/reporting/
  report-fields-rules.ts                  (novo) projeto+tipo+rascunho → registro {tag: valor}, puro
backend/modules/project-management/
  application/use-cases/                 + request/approve-activity-completion, entregáveis/anexos, wizard, cronograma
  application/ports/                     + project-activities.port, blob-store.port (feito no V5-1)
  infrastructure/adapters/                (feito no V5-1) s3-blob-store.ts: adapter sobre a seam lib/, cliente S3 injetável
  infrastructure/repositories/           prisma-* correspondentes
backend/modules/attestation/             (novo) certificates + AcroForm + lembrete dia 19
  application/ports/                     attestation-document.port (domain → adapter, nunca pdf-lib no domain)
  infrastructure/adapters/               acroform-attestation.adapter.ts (lê templates/, preenche, achata, sobe ao bucket)
backend/modules/reporting/               + technical-reports + ReportDraftPort + adapter openai-compatible
  infrastructure/adapters/               docx-report.adapter.ts (docx-templates sobre templates/*.tagged.docx)
tests/unit/scripts/report-templates-drift.test.ts
                                          (novo, V5-1a) guarda de deriva: sha256 dos oficiais,
                                          42 nomes do AcroForm, inventário de comandos e a
                                          cópia marcada idêntica à derivação do script
tests/unit/**                            (demais) guardas por batch
backend/composition/root.ts              wiring dos ports novos (DEC-21)
lib/services/cron-service.ts             + job de atraso (diário) + lembrete dia 19
app/api/projects/route.ts                criação via wizard (cronograma opcional, DEC-100)
app/api/projects/[id]/{deliverables,attachments,cronograma,activities,images}/route.ts
app/api/projects/[id]/{logo,banner}/route.ts   (upload → bucket)
app/api/users/banner/route.ts            (upload → bucket; espelho do avatar)
app/api/technical-reports/...  app/api/certificates/...
features/projects/…                      wizard, header com banner/logo, aba cronograma
features/tasks/…                         seletor de atividade (V5-6)
app/(dashboard)/dashboard/profile/…      banner do usuário
app/(dashboard)/dashboard/leaderboard/…  pódio #1 com banner
components/ui/notifications-panel.tsx    destaque de prioridade
```

## 6. Gates por batch

| Gate | Comando — critério |
|---|---|
| **G0** | `npm run arch:check` — exit 0, **allow-list vazia**. Baseline 2026-10-13 (depois do V5-3): 879/3635 |
| **G1** | `npm run lint` — 0 erros (em worktree: `npx eslint --no-eslintrc --config .eslintrc.json <arquivos>`) |
| **G2** | `npx tsc --noEmit` — 0 erros. **Condição pré-existente medida em 2026-10-13:** o `dev` já vinha com **1 erro** em `features/laboratorio/__tests__/floating-timer-tabs.test.tsx:105` (`exact` não existe em `ByRoleOptions` do `@testing-library/dom@10.4.1`) — idêntico no `HEAD` limpo (conferido com `git stash`), fora do V5-1 |
| **G3** | `npx vitest run tests/unit features` — zero failure. **Baseline 2026-10-13 (depois do V5-3): 113/1517** (era 109/1474 no V5-2a, 108/1455 no V5-2d, 108/1432 no V5-2c, 105/1380 no V5-2b, 104/1365 no V5-1a). O comando é `tests/unit features`: rodar `tests/unit tests/features` devolve 93/1301 e **não** é o gate da casa |
| **G4** | migration + roundtrip só contra `dq-dev-test-db` em `127.0.0.1:5433` (`npm run db:test:up` + `db:test:setup`; `g4-normalize.sql` obrigatório) — suíte completa (baseline 2026-10-13, depois do V5-3: **123/1608**). **Migrations novas seguem o protocolo do V4-4:** `migrate diff` offline + `migrate deploy`, **nunca** `migrate dev` contra a 5432 (risco de RESET nos dados reais) |
| **G5** | `npm run docs:build` + `docs:check` — obrigatório em V5-2, V5-3, V5-5, V5-6, V5-8, V5-9, V5-10, V5-11 |
| **G6** | recapturar telas do guia quando a captura deixa de representar a tela (V5-2 muda o detail do projeto; V5-3 muda perfil e quadro) |

Regra de fechamento: **batch não entra em `done` com gate vermelho ou lacuna aberta de
que ele mesmo dependa.** O runner da casa é `scripts/verify.sh` (G0..G4 em sequência, com
o guard `assert-test-db` recusando 5432 antes de rodar teste) — use-o em vez de chamar os
gates soltos. O bucket precisa estar no ar para V5-2+ (`docker compose up -d seaweedfs`);
sem ele o batch falha em dev — provisionar junto do serviço. O V5-1 já deixou o serviço
pronto (`docker compose up -d seaweedfs` exige `S3_ACCESS_KEY`/`S3_SECRET_KEY`/`S3_BUCKET`
no ambiente/.env — DEC-131), mas **nada de produção o consome ainda**.

## 7. Regras a congelar em teste **antes** do código

1. **Recompensa da atividade = 100 × meses marcados na tabela do cronograma** (DEC-103 +
   DEC-126): as colunas são os meses e as linhas são as atividades; a atividade de 3 meses
   tem 3 "X" na linha (ex.: meses 4, 5 e 6). Não existe meia-mês nem arredondamento —
   ceil, floor e proporcional morreram com o DEC-126. Função pura em `activity-rules.ts`.
2. **Prêmio na aprovação**: `award = recompensa × (1,5 se ≥2 dias adiantada) − 0,10 ×
   recompensa × diasAtraso`, **piso em 0** (DEC-103 + DEC-74). Antecedência usa a mesma
   régua de ≥2 dias da DEC-97; atraso é fração diária, **não** os −10 fixos do usuário.
3. **Distribuição**: `parte_i = award × (tasksConcluídas_i_noProjeto ÷ tasksConcluídas_doProjeto)`;
   denominador 0 → divisão igual entre membros ativos; soma das partes = `award`
   (DEC-104). Membro sem task leva 0.
4. **Trava da atividade (DEC-99)**: solicitar conclusão com task pendente → 400, frase
   própria (análogo à trava da mãe).
5. **Duas fases (DEC-76)**: solicitar = líder/membro gestor + provas; aprovar =
   `GLOBAL_PROJECT_MANAGERS`; **auto-aprovação só para COORDENADOR** (DEC-77);
   idempotência `GAMIFICATION:ACTIVITY_COMPLETED:<id>`; o prêmio **nunca** cai na
   solicitação.
6. Tarefa concluída de projeto incrementa `projects.points` com o valor creditado ao
   usuário (mantém DEC-63); escrita do saldo com **piso 0**; nenhum `UPDATE` direto de UI.
7. Atraso: atividade vencida e não aprovada gera **uma** notificação prioritária por
   atividade (`overdueNotifiedAt`), líder + coordenadores/gerentes (DEC-64).
8. Criação de task: atividade do período atual pré-selecionada; seletor só com futuras +
   vigente; sem atividade vigente = vazio (não quebra).
9. Wizard: criar projeto **sem** cronograma é válido e idêntico ao criação simples de
   antes; com cronograma, cria projeto + goals + atividades numa transação (rollback
   completo se qualquer linha falhar).
10. Atestado: validação dos campos do AcroForm antes do upload; sem coluna de status
    (DEC-75); lembrete dia 19 só no dia 19, audiência da DEC-72.
11. **Imagens**: logo/banner validados (mime imagem, ≤5 MB, magic bytes — mesmo padrão do
    avatar); servidas com regra de acesso de projeto (logo/banner podem ser públicos?
    decidir no batch; default = mesma regra do projeto).
12. **Nenhum blob novo fora do bucket** (DEC-101): qualquer `writeFile` de arquivo novo
    é bug — e qualquer caminho de escrita novo em disco precisa `mkdir`+`chown` no
    Dockerfile (gotcha A11), o que justifica o bucket (DEC-101/DEC-131).
13. **Leitura de projeto é livre (DEC-127)**: qualquer autenticado **lista e abre** qualquer
    projeto; os filhos (anexos, horas, cronograma, provas) herdam a leitura. Escrita e
    gestão seguem a ACL atual (`MANAGE_PROJECTS` / `GLOBAL_PROJECT_MANAGERS`). Congelar em
    teste: VOLUNTARIO outsider vê projeto dos outros, e o par medido hoje
    (COLABORADOR lista-tudo / detalhe nega) deixa de existir.
14. **O template oficial é a autoridade da formatação** (DEC-129/130): o sistema **nunca**
    escreve estilo, fonte, tamanho ou margem. No DOCX, o texto entra **dentro do run que já
    carrega** Times New Roman 12 (o adaptador não toca `w:rPr`, `styles.xml` nem `sectPr`);
    no PDF, só os **42 campos nomeados** do AcroForm recebem valor, com aparência Times e
    `flatten()` na entrega. Congelar em teste: o documento gerado tem o mesmo sha256 de
    `word/styles.xml`/`word/theme/theme1.xml` do template, e nenhum campo fora da lista é
    escrito.
15. **Deriva de template derruba o build** (DEC-128): teste guarda compara o sha256 do
    oficial, a lista dos 42 nomes do AcroForm e o inventário de comandos da cópia marcada
    (`listCommands`). Se o dono trocar o arquivo em `docs/Projeto/` sem re-derivar, o teste
    falha **nomeando** o campo que sumiu ou apareceu — mesmo padrão de
    `user-status-vocabulary.test.ts` e `user-delete-schema-drift.test.ts`.
16. **Regra pura antes do adaptador** (lição da DEC-90 e do `AwardableSubtask`): o mapeamento
    projeto+membro+horas+atividades → `{nomeDoCampo: valor}` é função pura em
    `backend/domain/` com `completed`/status **obrigatórios** na assinatura, e o adaptador
    pdf-lib/docx-templates só executa o registro. `pdf-lib`/`docx-templates` **não** podem
    ser importados por `backend/domain/` (RG-01..RG-06 do G0).
17. **Datas de projeto são data civil, e o saldo não é escrevível pela rota** (DEC-132, V5-2b):
    `projects.startDate`/`endDate` são `String` `YYYY-MM-DD` — a mesma decisão de
    `createdAt`/`dueDate` — e a aritmética é a de `backend/domain/time/civil-day.ts`. Congelado
    em teste: instantâneo ISO entra e sai como o dia civil de America/Sao_Paulo, dia inexistente
    e término anterior ao início são recusados, e `points` ignorado por `applyProjectUpdate`
    (regra 6). O V5-11 e o V5-5 leem exatamente estes campos.

## 8. Perguntas ao dono

Respondidas — D-A..D-AB (2026-10-06, 2026-10-07, 2026-10-09 e 2026-10-13), registro no
`STATE.json` (`answeredInstructions` para os ASK, `decisionRegistry` para as DEC). As três
que **substituíram decisões antigas**: DEC-103 pisa na DEC-67 (reusar `points-rules`),
DEC-104 pisa na DEC-68 (divisão integral) e DEC-130 pisa na parte "gerar o AcroForm" da
DEC-71 (o formulário oficial já existe com campos nomeados).

Em aberto — **nenhuma**. As duas perguntas que a medição dos templates abriu em 2026-10-13
foram respondidas na mesma rodada (D-AE..D-AN, §2.6):

- **`ASK-V5-06`** (relatório por projeto ou por participante) → **(a)**, **DEC-139**: um
  registro por projeto × tipo, DOCX gerado uma vez por membro a partir do mesmo texto. As
  opções (b) e (c) ficaram para trás: (b) multiplicaria texto e permissão por pessoa, (c)
  fugiria do formulário oficial, que é por estudante.
- **`ASK-V5-07`** (dados de pessoa) → **(a) tudo em `users`**, **DEC-138**, com o complemento
  da **DEC-140** (carga no vínculo, PROPPI no projeto). Escrevem a própria pessoa e a gestão;
  CPF tem leitura restrita. O custo aceito está registrado na DEC-138: modalidade e fomento
  deixam de ser dados do vínculo, então uma pessoa que participa de dois editais com
  modalidades diferentes tem uma modalidade só.

Fora deste plano (na fila, não esquecer):

- **Assinatura eletrônica do orientador** no DOCX ("este documento deverá ser assinado
  eletronicamente pelo Orientador") e o carimbo/data do atestado: fora do escopo da v1; a
  entrega é o documento preenchido, sem assinatura digital.

- **Migração dos blobs existentes** (avatares em `public/uploads/`, anexos em
  `data/uploads/reports/`) para o bucket — leva própria depois do plan-v5 (DEC-101).
- **Tela de vídeo** (upload/player na página do projeto) — bucket já aceita (DEC-101).
- Troca de provider de IA no multilab (spec-v2 feature 05) — o adapter por env já abre a
  porta; descoberta/seleção de modelo por laboratório é escopo do spec-v2.
- Polimento do prompt do rascunho de IA — iteração posterior ao V5-9.

## 9. Como o estado é monitorado

`STATE.json` nesta pasta é a fonte de verdade: `status` (`ready` → `in_progress` →
`done`), `waves[]` (V5-1, V5-1a, V5-2, V5-2a, V5-3..V5-12 com `status`/`decisions`/`scope`),
`decisionRegistry`, `batchLog[]` (só batch executado entra, com gates aferidos e gotchas),
`openQuestions` (**vazio desde 2026-10-13**), `answeredInstructions` (ASK-V5-01..07),
`blockers` (vazio — plan-v4 fechou). A numeração de decisões **continua** a global: plan-v6
consumiu DEC-105..114, o clean-arch (B6-restante + B9/B10) consumiu DEC-115..125 em
2026-10-08, e este plano consumiu DEC-126/127 (2026-10-09), DEC-128..130 (documentos
oficiais), DEC-131..137 (execução de V5-1, V5-2b/c/d, V5-2a e V5-3, em 2026-10-13),
DEC-138..146 (a rodada de alinhamento do dono, §2.6, também de 2026-10-13) e DEC-147/148
(execução do V5-4a e a divisão do V5-4 em V5-4a/V5-4b, 2026-10-13) — **a próxima
livre é a DEC-149**; antes de abrir decisão nova, `grep` os
cinco `STATE.json` (clean-arch, plan-v3, plan-v4, plan-v5, plan-v6; lição da colisão
DEC-61..64 do V4-4).
