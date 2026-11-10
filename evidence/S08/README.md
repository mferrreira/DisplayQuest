# S08 — bio em markdown, dialog no perfil e no painel, imagens no bucket

Slice: `S08` do plan-v21. Commits: `076ad5b` e `3bbf377`.

## Gate

- `gate-slice.sh` nos 4 aceites: 27 testes verdes
  (`tests/unit/api/user-markdown-image-routes.test.ts` 16,
  `tests/unit/api/user-bio-length-routes.test.ts` 4,
  `tests/unit/components/user-bio-dialog.test.tsx` 4,
  `tests/unit/components/user-bio-markdown.test.tsx` 3).
- Suíte completa: 325 arquivos / 3146 testes na 5433. `tsc` 0, `arch:check` sem violação
  (1367 módulos / 5871 dependências), lint limpo.
- Mutações medidas: gate da rota `POST` removido → 4 falhas; gate movido para depois de
  `request.formData()` → 2 falhas; teto de 2000 caracteres removido → 1 falha; chave
  `users/<id>` trocada por `projects/<id>` → 3 falhas; gate de visibilidade do `GET`
  bypassado → 1 falha.

## Instância (medido, container em 3000)

- `dialog-bio-preview.png` — Coordenador no `Configurações`: o botão "Editar biografia" abriu o
  mesmo dialog do projeto, com textarea, preview, botão "Anexar imagem" e "Salvar biografia".
- `perfil-proprio-markdown.png` — perfil próprio renderiza `strong`, lista e link da bio.
- `perfil-terceiro-markdown.png` — `/dashboard/profile?userId=3` renderiza `strong` e link com
  `rel="noopener noreferrer"`.
- `admin-bio-dialog.png` — "Configurar Usuário" no painel abre o mesmo dialog; a preview mostra
  a bio do Laboratorista em markdown.
- A imagem enviada pelo dialog foi inserida no cursor e salva na linha de `users` id 1:
  `![s08-rosto.png](/api/users/1/markdown-images/<uuid>.png?v=users/1/markdown-images/<uuid>.png)`
  seguida de `**Coordenador do laboratório**`, lista e link.
- A chave gravada no bucket é `users/1/markdown-images/<uuid>.png` — família própria, sem
  registro, nenhum caminho de escrita novo.

## Autoridade no servidor

- No `POST /api/users/<id>/markdown-images`, a rota valida o id, acha o usuário, autoriza
  `self` ou `MANAGE_USERS`, e só depois lê `request.formData()`.
- Terceiro sem gestão responde **403** com "Não autorizado" antes do corpo. Id inválido responde
  **400** antes do gate. Usuário ausente responde **404** antes de ler o corpo.
- No `GET /api/users/<id>/markdown-images/<name>`, usuário ausente responde **404** antes de tocar
  o bucket; perfil privado responde **403** sem devolver bytes; nome fora da forma responde
  **400**; chave ausente responde **404**.
- `PATCH` do perfil e `PUT` do painel devolvem **400** com
  "Bio não pode ter mais de 2000 caracteres".
