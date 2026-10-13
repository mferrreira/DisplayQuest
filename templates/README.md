# Templates dos documentos oficiais

Arquivos de **leitura** que o sistema passa a usar na geração dos documentos do projeto (V5-9
para o DOCX, V5-10 para o PDF). Nenhum deles é editado à mão depois de entrar aqui, e nenhum
caminho de escrita novo é criado no container: o Dockerfile copia esta pasta e pronto.

| Arquivo | O que é |
|---|---|
| `relatorio-tecnico.docx` | Template **oficial** do Relatório Técnico, byte-intacto. É a fonte da verdade do layout. |
| `relatorio-tecnico.tagged.docx` | **Cópia marcada**, derivada do oficial. É ela que recebe dados (V5-9). Nunca edite à mão. |
| `atestado-frequencia.pdf` | **Anexo IV** (Atestado de Frequência), AcroForm oficial com 42 campos nomeados. |

## Atualizar o template

O dono mantém os originais em `docs/Projeto/` (fora do git). Para trocar:

```bash
cp "docs/Projeto/[template] - Relatório Técnico.docx" templates/relatorio-tecnico.docx
npm run templates:tag          # re-deriva a cópia marcada
npx vitest run tests/unit/scripts/report-templates-drift.test.ts
```

O guarda de deriva falha de propósito quando o oficial muda, e diz o que precisa ser refeito:
o sha256 do arquivo, o inventário dos 42 campos do AcroForm, a lista de comandos da cópia
marcada e a checagem de que não sobrou branco literal. Atualize os números congelados no teste
**só** depois de conferir que a mudança no oficial foi intencional.

## Detalhes que não são óbvios

- A cópia marcada usa comandos escritos `{{campo}}`, e isso só funciona se o preenchimento
  passar `cmdDelimiter: ['{{', '}}']`. O padrão do `docx-templates` é `+++`, e `['{', '}']`
  **não** aceita chave dupla — medido: ele quebra `{{titulo}}` em dois comandos vazios. O par
  certo está em `CMD_DELIMITER`, em `scripts/tag-report-template.mjs`.
- Re-derivar escreve **o mesmo arquivo**: as entradas do zip recebem a data do documento
  oficial, em vez da data do run. Se `templates/relatorio-tecnico.tagged.docx` aparecer
  modificado num `git status` sem você ter mexido no oficial, desconfie — o determinismo
  foi quebrado.
