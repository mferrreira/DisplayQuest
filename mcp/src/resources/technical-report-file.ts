import {
  ProtocolError,
  ProtocolErrorCode,
  ResourceNotFoundError,
  ResourceTemplate,
  type McpServer,
  type Variables,
} from "@modelcontextprotocol/server"

import { DisplayQuestError } from "../errors.js"
import type { DisplayQuestClient } from "../displayquest-client.js"

export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

export const TECHNICAL_REPORT_FILE_RESOURCE_NAME = "technical-report-file"

/**
 * DEC-202: o DOCX não sai por tool — sai por `resources/read`, em base64. O `userId`
 * identifica o membro do projeto (a geração escreve um arquivo por membro ATIVO).
 */
export const TECHNICAL_REPORT_FILE_URI_TEMPLATE =
  "dq://projects/{projectId}/technical-reports/{reportId}/file?userId={userId}"

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function positiveId(value: string | string[] | undefined, name: string): number {
  const parsed = Number(first(value))
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ProtocolError(ProtocolErrorCode.InvalidParams, `${name} precisa ser um inteiro positivo`)
  }
  return parsed
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64")
}

export function registerTechnicalReportFileResource(server: McpServer, client: DisplayQuestClient): void {
  const template = new ResourceTemplate(TECHNICAL_REPORT_FILE_URI_TEMPLATE, { list: undefined })

  server.registerResource(
    TECHNICAL_REPORT_FILE_RESOURCE_NAME,
    template,
    {
      title: "Relatório técnico em DOCX",
      description:
        "Arquivo DOCX de um relatório técnico de projeto, gerado para um membro específico (userId).",
      mimeType: DOCX_MIME_TYPE,
    },
    async (uri, variables: Variables) => {
      const projectId = positiveId(variables.projectId, "projectId")
      const reportId = positiveId(variables.reportId, "reportId")
      const userId = positiveId(
        variables.userId ?? uri.searchParams.get("userId") ?? undefined,
        "userId",
      )

      try {
        const file = await client.requestBinary({
          method: "GET",
          path: `/api/projects/${projectId}/technical-reports/${reportId}/file`,
          query: { userId },
        })
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: file.contentType || DOCX_MIME_TYPE,
              blob: toBase64(file.bytes),
            },
          ],
        }
      } catch (error) {
        throw toProtocolError(error, uri.href)
      }
    },
  )
}

/**
 * O transporte fala JSON-RPC, então o erro do app vira erro de protocolo:
 * não gerado → `ResourceNotFoundError` (-32602 com `data.uri`), entrada inválida →
 * Invalid Params e o resto → Internal Error com a mensagem já segura do app.
 */
function toProtocolError(error: unknown, uri: string): Error {
  if (error instanceof DisplayQuestError) {
    if (error.status === 404) return new ResourceNotFoundError(uri, error.message)
    if (error.status === 400) return new ProtocolError(ProtocolErrorCode.InvalidParams, error.message)
    return new ProtocolError(ProtocolErrorCode.InternalError, error.message)
  }
  return new ProtocolError(
    ProtocolErrorCode.InternalError,
    "Não foi possível ler o arquivo no DisplayQuest",
  )
}
