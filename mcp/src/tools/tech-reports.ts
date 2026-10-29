import { z } from "zod"

import { asItems, asRecord } from "./helpers.js"
import { defineTool } from "./types.js"
import { DisplayQuestError, recode } from "../errors.js"

const REPORT_TYPES = ["parcial", "tecnico-final", "final"] as const

export const technicalReportListTool = defineTool({
  name: "technical_report_list",
  title: "Listar relatórios técnicos",
  description: "Relatórios técnicos do projeto, um por tipo.",
  readOnly: true,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
  }),
  returns: "reports: lista de relatórios; count: total.",
  errors: [400, 401, 404],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "GET",
      path: `/api/projects/${args.projectId}/technical-reports`,
    })
    const reports = asItems(body, "reports")
    return { reports, count: reports.length }
  },
})

export const technicalReportSaveTool = defineTool({
  name: "technical_report_save",
  title: "Salvar texto de relatório técnico",
  description: "Salva o texto único do par projeto × tipo. Gate de gestão/líder do projeto.",
  readOnly: false,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
    type: z.enum(REPORT_TYPES),
    content: z.string(),
  }),
  returns: "report: registro salvo.",
  errors: [400, 401, 403, 404],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "PUT",
      path: `/api/projects/${args.projectId}/technical-reports`,
      body: { type: args.type, content: args.content },
    })
    return { report: (body as Record<string, unknown>).report ?? null }
  },
})

export const technicalReportGenerateTool = defineTool({
  name: "technical_report_generate",
  title: "Gerar DOCX do relatório técnico",
  description:
    "Gera um DOCX oficial por membro ativo do projeto e grava no bucket. Responde 503 sem bucket configurado.",
  readOnly: false,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
    type: z.enum(REPORT_TYPES),
  }),
  returns: "files: userId, memberName, key e fileName por membro.",
  errors: [400, 401, 403, 404, 503],
  handler: async (args, ctx) => {
    let body: unknown
    try {
      body = await ctx.client.request({
        method: "POST",
        path: `/api/projects/${args.projectId}/technical-reports/${args.type}/generate`,
        body: {},
      })
    } catch (error) {
      // Só o 503 do bucket vira bucket_unavailable; 401/403/404 mantêm o código próprio.
      throw error instanceof DisplayQuestError && error.status === 503
        ? recode(error, "bucket_unavailable")
        : error
    }
    const files = asItems(body, "files")
    return { files, count: files.length }
  },
})

export const technicalReportDraftTool = defineTool({
  name: "technical_report_draft",
  title: "Rascunho de relatório técnico",
  description:
    "Devolve rascunho de IA a partir das fontes do projeto. Não salva. 502 se a IA estiver fora.",
  readOnly: false,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
    type: z.enum(REPORT_TYPES),
  }),
  returns: "draft: texto sugerido.",
  errors: [400, 401, 403, 404, 502],
  handler: async (args, ctx) => {
    let body: unknown
    try {
      body = await ctx.client.request({
        method: "POST",
        path: `/api/projects/${args.projectId}/technical-reports/${args.type}/draft`,
        body: {},
      })
    } catch (error) {
      // O 502 do rascunho é a IA fora do ar; os demais códigos seguem intactos.
      throw error instanceof DisplayQuestError && error.status === 502
        ? recode(error, "ai_unavailable")
        : error
    }
    return { draft: asRecord(body).draft ?? null }
  },
})
