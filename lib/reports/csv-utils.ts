// Utilidades de geração de CSV com proteção contra injeção de fórmula (A8).
// Referência OWASP: células cujo primeiro caractere é =, +, -, @, tab ou CR são
// avaliadas como fórmula pelo Excel/LibreOffice; prefixar ' neutraliza a
// interpretação mantendo o conteúdo visível (e a indentação inicial).

export function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value)

  // aspas para conter ; e quebras de linha; dobra aspas internas
  const escaped = text.replace(/"/g, '""')

  // insere ' imediatamente antes do primeiro caractere de fórmula,
  // preservando espaços de indentação iniciais
  const protectedText = escaped.replace(/^([ ]*)([=+\-@\t\r])/, "$1'$2")

  return `"${protectedText}"`
}