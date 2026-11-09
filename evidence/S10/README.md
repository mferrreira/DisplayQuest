# S10 — Fechamento do plan-v21

**Commit:** `4161a13` `docs(guia): S10 entregáveis, cronograma, descrição, bio e links — DEC-257..264, G6`

**Fatia:** gate completo na 5433, capturas G6 das telas tocadas, prosa do guia nos capítulos de projeto
e perfil, `AGENTS.md` com `DEC-257..264`.

**Aceite rodado:**

1. `set -a; source .env; set +a; export DATABASE_URL=postgresql://dq_dev:dq_dev_local_only@127.0.0.1:5433/dq_dev_test; npm run arch:check && npm run lint && npx tsc --noEmit && npx vitest run`
2. `npm run docs:build && npm run docs:check`
3. `test -n "$(grep -rn 'DEC-257' AGENTS.md)"`

**Medido no gate:**

- `arch:check`: 1374 módulos, 5902 dependências, sem violação.
- `lint`: exit 0, sem erro; os warnings já conhecidos da base (`no-use-empty`, `no-unused-vars`, `no-img-element`).
- `tsc --noEmit`: 0.
- `vitest run`: 330 arquivos / 3168 testes, todos passando.
- `docs:build`: técnico 15 seções / 33 figuras, usuário 12 seções / 63 figuras.
- `docs:check`: nenhum caractere suspeito.
- `grep DEC-257`: `AGENTS.md` tem `DEC-257`, e as notas vão até `DEC-264`.

**Documentação:**

- `AGENTS.md`: bloco `plan-v21` com `DEC-257..264`.
- `docs/src-usuario/04-projetos.md`: `Editar descrição X` no cartão, `Meta para X` no entregável,
  `Cumprir meta N` na meta, `Anexar imagem` na descrição.
- `docs/src-usuario/08-perfil-e-notificacoes.md`: `Links do perfil`, `Editar biografia`, preview,
  favicon, links no perfil próprio e de terceiro.
- `docs/src-usuario/09-administracao.md`: `Editar biografia` no diálogo `Configurar Usuário`, a
  mesma peça markdown do perfil.

**Capturas novas:**

- `docs/screens/dialogo-descricao-projeto.png`: `Editar descrição` na lista, `Descrição em markdown`,
  preview, `Anexar imagem`, `Salvar descrição`.
- `docs/screens/entregavel-meta-seletor.png`: `Arquivos`, entregável `GDD do laboratório`, seletor
  `Meta para` com `Sem meta` visível.
- `docs/screens/meta-cumprida-checkbox.png`: `Tarefas`, `Metas do projeto`, linha `1`, `Cumprir meta`
  como controle, `Adicionar meta`, `Cronograma`.
- `docs/screens/perfil-bio-dialog.png`: `Configurações`, `Editar biografia`, `Biografia em markdown`,
  preview, `Anexar imagem`, `Salvar biografia`.
- `docs/screens/admin-bio-dialog.png`: `Painel Administrativo`, `Usuários`, `Configurar`, `Editar
  biografia`, `Biografia em markdown`, preview, `Anexar imagem`.
- `docs/screens/perfil-links.png`: `Gerente` na `Configurações`, `Links`, `LinkedIn`, `GitHub` com
  favicon.
- `docs/screens/perfil-terceiro-links.png`: `Guia · Coordenação` abrindo `Guia · Participante`, com
  `Links`, `LinkedIn` e `GitHub`.

**Capturas tocadas:** `scripts/capture-user-guide.mjs` ganhou 7 entradas:
`dialogo-descricao-projeto`, `entregavel-meta-seletor`, `meta-cumprida-checkbox`, `perfil-bio-dialog`,
`admin-bio-dialog`, `perfil-links`, `perfil-terceiro-links`. Os nomes dos blocos `foto` no guia são os
mesmos IDs.

**Dados de captura:** a instância em `http://localhost:3000` recebeu:

- `users.id=1` renomeado para `Guia · Coordenação` (`coordenador@lab.com`), para o cabeçalho da captura.
- `users.id=21` criado como `Guia · Participante` (`guia.participante@lab.com`), Pesquisador, com CPF
  não usado na captura, matrícula, curso, modalidade, nível, fomento e `Links` de LinkedIn/GitHub.
- `users.id=2` (`gerente@lab.com`) recebeu `LinkedIn` + `GitHub` para `perfil-links` na `Configurações`.
- `users.id=21` foi criado com o mesmo hash de senha da conta de captura (`123`), para o guia não ficar
  dependente de login de terceiros.
- O projeto `Pesquisa em IA` já tinha entregável `GDD do laboratório`, meta `1` (`Dois protótipos
  funcionais`) e a rota de captura de `Arquivos` com `Sem meta` visível.

**Gotchas medidas:**

- `perfil-links` precisa de `aba: "Configurações"` porque a própria `Configurações` renderiza os
  links; a aba Atividade não mostra `Links`.
- `meta-cumprida-checkbox` verifica `Metas do projeto` como texto visível. O checkbox é nomeado por
  `aria-label="Cumprir meta N"`, e `innerText` não lê o rótulo do controle.
- `entregavel-meta-seletor` fotografa o seletor com `Sem meta` na tela. A frase `Meta para X` está no
  `aria-label` do `SelectTrigger`, não no `body.innerText`.
- `admin-bio-dialog` abre a primeira linha `Configurar` da lista de usuários. A captura não escreve.

**Fechamento:** S10 fecha o plan-v21 com as fatias S01..S10. Os `DEC-257..264` estão em `AGENTS.md` e
`docs` do guia. Próxima livre: `DEC-265`.
