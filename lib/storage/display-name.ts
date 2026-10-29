/**
 * V5-2c — nome de arquivo exibido, peça ÚNICA dos dois seams de arquivo da casa.
 *
 * Era local a `report-uploads.ts`. Os anexos de projeto precisam da mesma regra, e uma cópia
 * de três linhas em dois lugares é exatamente o modo de falha que a DEC-90 registra: um lado
 * é corrigido e o outro continua mentindo.
 */
import path from "node:path"

export const DISPLAY_NAME_MAX_LENGTH = 255

/** Nome de exibição: só o basename, sem caractere de controle ou de caminho, com teto. */
export function sanitizeDisplayName(name: string): string {
  const base = path.basename(name || "arquivo").replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_")
  return base.slice(0, DISPLAY_NAME_MAX_LENGTH) || "arquivo"
}
