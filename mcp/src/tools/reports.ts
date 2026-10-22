import { z } from "zod"

import { asRecord } from "./helpers.js"
import { defineTool } from "./types.js"

const PERIOD_TYPES = ["weekly", "biweekly", "monthly", "semiannual", "annual"] as const

export const weeklyReportGenerateTool = defineTool({
  name: "weekly_report_generate",
  title: "Gerar relatório semanal",
  description:
    "Gera o relatório de uma pessoa para o período. Gate: self ou MANAGE_USERS — o laboratorista não gera para terceiro por esta rota.",
  readOnly: false,
  inputSchema: z.object({
    userId: z.number().int().positive(),
    weekStart: z.string().min(1),
    weekEnd: z.string().min(1),
  }),
  returns: "weeklyReport: relatório gerado.",
  errors: [400, 401, 403, 404],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "POST",
      path: "/api/weekly-reports/generate",
      body: { userId: args.userId, weekStart: args.weekStart, weekEnd: args.weekEnd },
    })
    return { weeklyReport: asRecord(body).weeklyReport ?? null }
  },
})

export const weeklyReportBulkGenerateTool = defineTool({
  name: "weekly_report_bulk_generate",
  title: "Gerar relatórios em lote",
  description:
    "Gera relatórios para TODOS os usuários ativos nos períodos que cobrem de `from` a `to`. Exige MANAGE_USERS. " +
    "É a escrita de maior alcance do sistema: use período curto e só no projeto de areia.",
  readOnly: false,
  inputSchema: z.object({
    periodType: z.enum(PERIOD_TYPES),
    from: z.string().min(1),
    to: z.string().min(1),
  }),
  returns: "result: resumo do lote devolvido pelo app.",
  errors: [400, 401, 403],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "POST",
      path: "/api/weekly-reports/bulk",
      body: { periodType: args.periodType, from: args.from, to: args.to },
    })
    return { result: asRecord(body).result ?? null }
  },
})
