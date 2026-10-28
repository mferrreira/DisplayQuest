import { z } from "zod"

import { defineTool } from "./types.js"
import { asItems, sanitizeUsers } from "./helpers.js"

export const peopleListTool = defineTool({
  name: "people_list",
  title: "Listar pessoas",
  description:
    "Lista as pessoas visíveis ao ator com id, nome, papéis, status, avatar, capa e meta semanal. Não devolve CPF.",
  readOnly: true,
  inputSchema: z.object({}),
  returns: "users: lista de pessoas; count: total.",
  errors: [401, 403],
  handler: async (_args, ctx) => {
    const body = await ctx.client.request({ method: "GET", path: "/api/users" })
    const users = sanitizeUsers(asItems(body, "users"))
    return { users, count: users.length }
  },
})

export const peopleStatisticsTool = defineTool({
  name: "people_statistics",
  title: "Estatísticas de pessoas",
  description:
    "Contagens e estatísticas de usuários. Exige MANAGE_USERS. type: roles, status ou general.",
  readOnly: true,
  inputSchema: z.object({
    type: z.enum(["roles", "status", "general"]).optional(),
  }),
  returns: "statistics: bloco devolvido pelo app (formato varia com o tipo).",
  errors: [401, 403],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "GET",
      path: "/api/users/statistics",
      query: { type: args.type },
    })
    return { statistics: (body as Record<string, unknown>).statistics ?? null }
  },
})

export const leaderboardGetTool = defineTool({
  name: "leaderboard_get",
  title: "Quadro mensal",
  description:
    "Lê o quadro do mês corrente quando month é omitido ou vazio, e o fechamento de um mês nomeado. live indica que o mês ainda usa o placar atual.",
  readOnly: true,
  inputSchema: z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional().or(z.literal("")),
  }),
  returns: "Resposta de GET /api/board: mês, rótulo, live, estado do fechamento, entries e aviso; o mês corrente também inclui closedMonths.",
  errors: [400, 401],
  handler: async (args, ctx) => {
    return ctx.client.request({
      method: "GET",
      path: "/api/board",
      query: args.month ? { month: args.month } : {},
    })
  },
})
