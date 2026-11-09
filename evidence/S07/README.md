# S07 — imagem na descrição: botão, drop, bucket e inserção no texto

Slice: `S07` do plan-v21. Commit: `TBD`.

## Gate

- `gate-slice.sh` nos 4 aceites: 33 testes verdes
  (`tests/unit/api/project-markdown-image-routes.test.ts` 16,
  `tests/unit/components/project-description-dialog.test.tsx` 8,
  `tests/unit/lib/markdown-render.test.ts` 7,
  `tests/integration/markdown-image-bucket-roundtrip.test.ts` 2 contra o bucket real).
- Suíte completa: 319 arquivos / 3117 testes na 5433. `tsc` 0, `arch:check` sem violação
  (1359 módulos / 5827 dependências), lint limpo.
- Mutações medidas: filtro de imagem invertido (`kind !== "pdf"`) → 4 falhas; gate movido para
  depois de `request.formData()` → 2 falhas; inserção no fim em vez do cursor → 1 falha.

## Instância (medido, container em 3000)

- `dialog-upload-preview.png` — Coordenador no dialog de "Pesquisa em IA": o botão "Anexar
  imagem" abriu o seletor, o PNG 2×2 foi enviado, e a preview mostrou o `<img>` com a URL da
  rota autenticada. A linha `![capa-s07.png](...)` entrou no texto.
- `detalhe-imagem-render.png` — depois de Salvar, a tela do projeto mostra o título
  "Fluxo do projeto" e a imagem embutida.
- O banco guarda, na linha 2:
  `## Fluxo do projeto\n![capa-s07.png](/api/projects/2/markdown-images/4b651628-…-555555555555.png?v=projects/2/markdown-images/4b651628-…-555555555555.png)`.
  A chave gravada no bucket é `projects/2/markdown-images/<uuid>.png` — família própria, sem
  registro, nenhum caminho de escrita novo.

## Autoridade no servidor (medido por HTTP)

- `POST /api/projects/2/markdown-images` com cookie do Voluntário (membro INATIVO na Pesquisa
  em IA) → **403** com "Usuário não tem permissão para gerenciar este projeto", e nenhum
  objeto no bucket — o gate corre antes de `request.formData()`.
