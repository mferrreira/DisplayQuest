import { z } from "zod"

import { asItems } from "./helpers.js"
import { defineTool } from "./types.js"

export const taskListTool = defineTool({
  name: "task_list",
  title: "Listar tarefas",
  description:
    "Tarefas visíveis ao ator, opcionalmente de um projeto. Pode vir com subtasks vazias quando a autoridade não permite vê-las.",
  readOnly: true,
  inputSchema: z.object({
    projectId: z.number().int().positive().optional(),
  }),
  returns: "tasks: lista de tarefas; count: total.",
  errors: [400, 401],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "GET",
      path: "/api/tasks",
      query: { projectId: args.projectId },
    })
    const tasks = asItems(body, "tasks")
    return { tasks, count: tasks.length }
  },
})

export const globalProgressGetTool = defineTool({
  name: "global_progress_get",
  title: "Progresso global das tarefas",
  description: "Progresso das tarefas globais. Exige MANAGE_USERS.",
  readOnly: true,
  inputSchema: z.object({}),
  returns: "globalTasks: lista com contagens e taxas por pessoa.",
  errors: [401, 403],
  handler: async (_args, ctx) => {
    const body = await ctx.client.request({
      method: "GET",
      path: "/api/tasks/global-progress",
    })
    const globalTasks = asItems(body, "globalTasks")
    return { globalTasks, count: globalTasks.length }
  },
})
