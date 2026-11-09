# S06 — descrição em markdown com preview, ícone no card, porta R9

Slice: `S06` do plan-v21. Commit: `eac0dc2`.

## Gate

- `gate-slice.sh` nas 6 suítes de aceção: 29 testes verdes
  (`tests/unit/lib/markdown-render.test.ts`, `tests/unit/api/project-description-route.test.ts`,
  `tests/unit/components/project-description-dialog.test.tsx`,
  `tests/unit/components/project-list-edit-icon.test.tsx`,
  `tests/unit/modules/project-management/project-list-projection.test.ts`,
  `tests/integration/project-description-roundtrip.test.ts`).
- Suíte completa: 319 arquivos / 3096 testes na 5433. `tsc` 0, `arch:check` sem violação
  (1354 módulos / 5792 dependências), lint limpo.
- Mutações medidas: gate removido do use case → 2 falhas; adapter sem o filtro `situacao
  ATIVO` → 2 falhas; ícone só para gestão → 1 falha; projeção `isMemberActive` sem o filtro
  de situação → 1 falha.

## Instância (medido, container em 3000)

- `lista-icone-gestao.png` — Coordenador: os três cards têm o lápis "Editar descrição X", ao
  lado do Editar/Excluir.
- `detalhe-render-markdown.png` — depois de salvar, a tela do projeto renderiza o markdown:
  negrito em `strong`, link "repositório" clicável, e o `<script>` cru aparece como texto,
  não como script.
- Dialog (mediido no DOM da captura, sem foto isolada): textarea "Descrição em markdown" +
  preview pela mesma peça da tela; `**objetivo do projeto**` virou negrito, o link virou link,
  `<script>alert(1)</script>` foi escapado. Salvar mandou `PUT /api/projects/2/description`
  e o banco guarda `**objetivo do projeto** e [repositório](...) `+` `<script>...`+`` na linha 2
  (psql na 5432).
- `colaborador-icone-ativo.png` — Colaborador (membro ATIVO, sem gestão): só o lápis, sem
  Editar/Excluir. Escreveu a descrição da Automação de Processos pela tela; o banco recebeu
  `## Etapa atual\n- automação do fluxo de atestados`.
- `voluntario-lista-2-3.png` — Voluntário, membro INATIVO na Pesquisa em IA e não-membro na
  Automação: nenhum lápis nesses dois cards.
- `voluntario-1-ativo-icone.png` — o mesmo Voluntário, ATIVO no Sistema de Gestão: o lápis
  aparece só nesse card.

## Autoridade no servidor (medido por HTTP, cookie de voluntário)

- `PUT /api/projects/2/description` (membro INATIVO) → **403** com
  "Usuário não tem permissão para gerenciar este projeto".
- `PUT /api/projects/1/description` (membro ATIVO) → **200**. O corpo escrito ali foi revertido
  para o texto de seed.
