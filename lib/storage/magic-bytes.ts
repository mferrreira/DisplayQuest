/**
 * V5-2c — assinatura de conteúdo (magic bytes), peça ÚNICA dos dois seams de arquivo da casa
 * (`report-uploads.ts`, `blob-store.ts`).
 *
 * Existir em um lugar só é o ponto: a mesma checagem não pode divergir entre o anexo de
 * relatório (disco) e o anexo de projeto (bucket). A tabela veio de `report-uploads.ts`, onde
 * ela já estava desde a mitigação A11.
 *
 * Diferença deliberada em relação à cópia original: o `default` não devolve mais `true` para
 * qualquer mime. Mime sem assinatura é **lista nomeada** (`text/plain`, `text/csv`); mime
 * desconhecido devolve `false`. Para o seam de relatório isso não muda nada — os dois já
 * estavam na allowlist e caíam no mesmo `true`. Para o seam de bucket, que tem allowlist
 * própria e mais estreita, "desconhecido" deixa de ser aprovado por ausência de regra.
 */

/** Tipos sem assinatura reconhecível: não há o que comparar, então passam por decisão explícita. */
const SIGNATURELESS_MIME = new Set(["text/plain", "text/csv"])

/** Quantos bytes iniciais bastam para as assinaturas desta tabela (WEBP olha no offset 8). */
export const MAGIC_HEAD_BYTES = 16

/** Lê a cabeça do arquivo sem carregar o blob inteiro. */
export async function readFileHead(file: File, bytes: number = MAGIC_HEAD_BYTES): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, bytes).arrayBuffer())
}

export function magicMatches(mime: string, head: Uint8Array): boolean {
  const starts = (...bytes: number[]) => bytes.every((b, i) => head[i] === b)
  const ascii = (offset: number, text: string) =>
    text.split("").every((ch, i) => head[offset + i] === ch.charCodeAt(0))

  switch (mime) {
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47)
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff)
    case "image/gif":
      return ascii(0, "GIF8")
    case "image/webp":
      return ascii(0, "RIFF") && ascii(8, "WEBP")
    case "application/pdf":
      return ascii(0, "%PDF")
    case "video/mp4":
    case "video/quicktime":
      return ascii(4, "ftyp")
    case "video/webm":
      return starts(0x1a, 0x45, 0xdf, 0xa3)
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      return starts(0xd0, 0xcf, 0x11, 0xe0) // OLE2
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return starts(0x50, 0x4b, 0x03, 0x04) // ZIP
    default:
      return SIGNATURELESS_MIME.has(mime)
  }
}
