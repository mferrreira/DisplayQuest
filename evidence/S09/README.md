# S09 — links da pessoa com favicon no perfil

Slice `S09` do plan-v21. Commits: `d915c30`, `cb0a80d`, `f328528`, `c94c53d`, `6591864`.

## Gate

- `gate-slice.sh` nos 4 aceites: 20 verdes — `user-links-rules` 7, `user-profile-links` 5, `user-links-display` 7, `own-profile-links` 1.
- A suíte dos 6 arquivos de S09, incluindo `person-data` e `session-links`, fecha com 39 verdes: 7, 5, 7, 1, 18, 1.
- Suíte completa: 330 arquivos / 3168 testes na 5433. `tsc` 0, `arch:check` sem violação (1374 módulos / 5902 dependências), lint sem erro.
- Mutações medidas: remover `links` da projeção da lista de usuários deixa `person-data.test.ts` vermelho; remover `--color-link` da folha do tema deixa a guarda de token vermelha; remover o teto de 10 em `normalizeUserLinks` deixa as guardas de domínio e rota vermelhas.

## Instância (medido, container em 3000)

- `perfil-links-desktop.png` — leitura da Configurações no perfil próprio: `LinkedIn` e `GitHub`.
- `perfil-links-mobile.png` — a mesma lista em 390×844.
- `perfil-links-dark.png` — tema escuro; o link usa `text-link`, não `text-primary`.
- `perfil-links-protocolo.png` — a Configurações aceita `github.com` sem protocolo; a rota grava a forma com `https://`.
- `perfil-links-11-10-limit-ui.png` — a Configurações com 10 linhas: o botão "Adicionar link" nasce desabilitado.
- `perfil-links-11-add-ui.png` — o formulário com as 11 linhas antes de salvar; o botão está desabilitado.
- `perfil-links-11-refusado.png` — resposta da rota autenticada para 11 links: 400 `Máximo de 10 links`. Nada foi gravado; `users/1.links` permaneceu LinkedIn/GitHub.
- `perfil-links-fallback.png` — favicon pendurado; o glyph `ExternalLink` fica no lugar da imagem.
- `perfil-terceiro-links-desktop.png`, `perfil-terceiro-links-mobile.png`, `perfil-terceiro-links-dark.png` — perfil de terceiro (`?userId=2`) mostra `GitHub` com o favicon da mesma fonte.
- `proprio-config-leitura-*.png` e `terceiro-links-*live.png` são as medições da review; as capturas nomeadas acima são os exemplares canônicos.
