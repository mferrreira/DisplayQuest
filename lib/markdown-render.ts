import MarkdownIt from "markdown-it"

/**
 * renderProjectMarkdown — a PEÇA ÚNICA de markdown da descrição do projeto (plan-v13, regra 2).
 *
 * `html: false` é a garantia de injeção: HTML cru é escapado, nunca interpretado. `linkify: true`
 * transforma URL nua em âncora. Links ganham `rel="noopener noreferrer"`. A validação default do
 * markdown-it recusa protocolos perigosos (`javascript:` não vira link).
 *
 * Markdown só na descrição do projeto — cartões da lista e seções do Dashboard permanecem texto
 * puro. Quem precisa de markdown em outro texto consome ESTA peça, não uma segunda conta.
 */

const md = new MarkdownIt({ html: false, linkify: true })

md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  tokens[idx].attrSet("rel", "noopener noreferrer")
  return self.renderToken(tokens, idx, options)
}

export function renderProjectMarkdown(source: string): string {
  return md.render(source)
}
