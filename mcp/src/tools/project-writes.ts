import { z } from "zod"

import { asRecord } from "./helpers.js"
import { defineTool } from "./types.js"

const projectFields = {
  name: z.string().min(1),
}

export const projectCreateTool = defineTool({
  name: "project_create",
  title: "Criar projeto",
  description:
    "Cria o projeto e, opcionalmente, o cronograma inicial. A conta de serviço vira gerente do projeto criado.",
  readOnly: false,
  inputSchema: z.object({
    ...projectFields,
    description: z.string().optional(),
    status: z.enum(["active", "completed", "archived"]).optional(),
    leaderId: z.number().int().positive().nullable().optional(),
    links: z
      .array(z.object({ label: z.string(), url: z.string() }))
      .optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    editalNumber: z.string().optional(),
    processNumber: z.string().optional(),
    proppiNumber: z.string().optional(),
    volunteerIds: z.array(z.number().int().positive()).optional(),
    cronograma: z
      .object({
        goals: z
          .array(z.object({ description: z.string(), target: z.number().optional() }))
          .optional(),
        activities: z
          .array(
            z.object({
              description: z.string(),
              firstMonth: z.string(),
              lastMonth: z.string(),
              responsibleId: z.number().int().positive().nullable().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  }),
  returns: "project: projeto criado.",
  errors: [400, 401, 403],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "POST",
      path: "/api/projects",
      body: args,
    })
    return { project: asRecord(body).project ?? null }
  },
})

export const projectUpdateTool = defineTool({
  name: "project_update",
  title: "Atualizar projeto",
  description:
    "Atualiza campos do projeto. Não aceita points, logoKey nem bannerKey. Chave ausente não apaga.",
  readOnly: false,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    status: z.enum(["active", "completed", "archived"]).optional(),
    leaderId: z.number().int().positive().nullable().optional(),
    links: z
      .array(z.object({ label: z.string(), url: z.string() }))
      .optional(),
    startDate: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    editalNumber: z.string().nullable().optional(),
    processNumber: z.string().nullable().optional(),
    proppiNumber: z.string().nullable().optional(),
  }),
  returns: "project: projeto atualizado.",
  errors: [400, 401, 403, 404],
  handler: async (args, ctx) => {
    const { projectId, ...data } = args
    const body = await ctx.client.request({
      method: "PUT",
      path: `/api/projects/${projectId}`,
      body: data,
    })
    return { project: asRecord(body).project ?? null }
  },
})

export const deliverableCreateTool = defineTool({
  name: "deliverable_create",
  title: "Criar entregável",
  description: "Cria um entregável do projeto.",
  readOnly: false,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
  }),
  returns: "deliverable: entregável criado.",
  errors: [400, 401, 403, 404],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "POST",
      path: `/api/projects/${args.projectId}/deliverables`,
      body: { name: args.name, quantity: args.quantity },
    })
    return { deliverable: asRecord(body).deliverable ?? null }
  },
})

export const activityCreateTool = defineTool({
  name: "activity_create",
  title: "Criar atividade do cronograma",
  description: "Cria uma linha do cronograma no intervalo de meses marcado.",
  readOnly: false,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
    description: z.string().min(1),
    firstMonth: z.string().min(1),
    lastMonth: z.string().min(1),
    responsibleId: z.number().int().positive().nullable().optional(),
  }),
  returns: "activity: linha criada.",
  errors: [400, 401, 403, 404],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "POST",
      path: `/api/projects/${args.projectId}/activities`,
      body: {
        description: args.description,
        firstMonth: args.firstMonth,
        lastMonth: args.lastMonth,
        responsibleId: args.responsibleId,
      },
    })
    return { activity: asRecord(body).activity ?? null }
  },
})

export const activityUpdateTool = defineTool({
  name: "activity_update",
  title: "Atualizar atividade do cronograma",
  description: "Atualiza descrição, responsável e meses da linha. Não muda status.",
  readOnly: false,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
    activityId: z.number().int().positive(),
    description: z.string().min(1).optional(),
    firstMonth: z.string().min(1).optional(),
    lastMonth: z.string().min(1).optional(),
    responsibleId: z.number().int().positive().nullable().optional(),
  }),
  returns: "activity: linha atualizada.",
  errors: [400, 401, 403, 404],
  handler: async (args, ctx) => {
    const { projectId, activityId, ...data } = args
    const body = await ctx.client.request({
      method: "PATCH",
      path: `/api/projects/${projectId}/activities/${activityId}`,
      body: data,
    })
    return { activity: asRecord(body).activity ?? null }
  },
})
