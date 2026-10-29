import { z } from "zod"

import { asArray, asItems, asRecord } from "./helpers.js"
import { defineTool } from "./types.js"

export const hoursGetTool = defineTool({
  name: "hours_get",
  title: "Horas do projeto",
  description: "Horas agregadas do projeto, com recorte opcional por semana.",
  readOnly: true,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
    weekStart: z.string().optional(),
    weekEnd: z.string().optional(),
  }),
  returns: "hours: totalHours, sessionCount, hoursByUser e sessions.",
  errors: [401, 404],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "GET",
      path: `/api/projects/${args.projectId}/hours`,
      query: { weekStart: args.weekStart, weekEnd: args.weekEnd },
    })
    return { hours: (body as Record<string, unknown>).hours ?? null }
  },
})

export const workSessionsListTool = defineTool({
  name: "work_sessions_list",
  title: "Listar sessões de trabalho",
  description:
    "Sessões no escopo do ator: gestor vê todas, usuário comum vê as próprias. Filtros de pessoa, projeto e status.",
  readOnly: true,
  inputSchema: z.object({
    userId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),
    status: z.enum(["active", "paused", "completed"]).optional(),
    active: z.boolean().optional(),
  }),
  returns: "sessions: lista de sessões; count: total.",
  errors: [401, 403],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "GET",
      path: "/api/work-sessions",
      query: {
        userId: args.userId,
        projectId: args.projectId,
        status: args.status,
        active: args.active === true ? "true" : undefined,
      },
    })
    const sessions = asArray(body)
    return { sessions, count: sessions.length }
  },
})

export const weeklyHoursHistoryGetTool = defineTool({
  name: "weekly_hours_history_get",
  title: "Histórico semanal de horas",
  description:
    "Histórico semanal de horas ou estatísticas quando stats=true. Exige MANAGE_USERS no bloco de estatísticas.",
  readOnly: true,
  inputSchema: z.object({
    weekStart: z.string().optional(),
    userId: z.number().int().positive().optional(),
    stats: z.boolean().optional(),
  }),
  returns: "stats quando stats=true; senão history.",
  errors: [401, 403],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "GET",
      path: "/api/weekly-hours-history",
      query: {
        weekStart: args.weekStart,
        userId: args.userId,
        stats: args.stats === true ? "true" : undefined,
      },
    })
    const record = asRecord(body)
    if (args.stats === true) return { stats: record.stats ?? null }
    return { history: record.history ?? [] }
  },
})

export const weeklyReportListTool = defineTool({
  name: "weekly_report_list",
  title: "Listar relatórios semanais",
  description: "Relatórios semanais, com filtros de pessoa e período.",
  readOnly: true,
  inputSchema: z.object({
    userId: z.number().int().positive().optional(),
    weekStart: z.string().optional(),
    weekEnd: z.string().optional(),
  }),
  returns: "weeklyReports: lista de relatórios; count: total.",
  errors: [401, 403],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "GET",
      path: "/api/weekly-reports",
      query: { userId: args.userId, weekStart: args.weekStart, weekEnd: args.weekEnd },
    })
    const weeklyReports = asItems(body, "weeklyReports")
    return { weeklyReports, count: weeklyReports.length }
  },
})
