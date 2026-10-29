import { z } from "zod"

import { toToolErrorContent, type ToolErrorContent } from "../errors.js"
import { asArray, asItems, asRecord, countByStatus, sanitizeUsers } from "./helpers.js"
import { defineTool, type ToolContext } from "./types.js"
import type { DisplayQuestClient } from "../displayquest-client.js"

const PROJECT_OVERVIEW_SECTIONS = [
  "members",
  "deliverables",
  "activities",
  "tasks",
  "hours",
  "technicalReports",
  "stats",
] as const

type ProjectOverviewSection = (typeof PROJECT_OVERVIEW_SECTIONS)[number]

interface SectionFailure {
  section: ProjectOverviewSection
  status: number
  code: string
  message: string
}

async function loadSection(
  client: DisplayQuestClient,
  projectId: number,
  section: ProjectOverviewSection,
): Promise<unknown> {
  switch (section) {
    case "members":
      return client.request({
        method: "GET",
        path: `/api/projects/${projectId}/members`,
      })
    case "deliverables":
      return client.request({
        method: "GET",
        path: `/api/projects/${projectId}/deliverables`,
      })
    case "activities":
      return client.request({
        method: "GET",
        path: `/api/projects/${projectId}/cronograma`,
      })
    case "tasks":
      return client.request({
        method: "GET",
        path: "/api/tasks",
        query: { projectId },
      })
    case "hours":
      return client.request({
        method: "GET",
        path: `/api/projects/${projectId}/hours`,
      })
    case "technicalReports":
      return client.request({
        method: "GET",
        path: `/api/projects/${projectId}/technical-reports`,
      })
    case "stats":
      return null
  }
}

export const projectListTool = defineTool({
  name: "project_list",
  title: "Listar projetos",
  description: "Lista todos os projetos visíveis ao autenticado.",
  readOnly: true,
  inputSchema: z.object({}),
  returns: "projects: lista de projetos; count: total.",
  errors: [401],
  handler: async (_args, ctx) => {
    const body = await ctx.client.request({ method: "GET", path: "/api/projects" })
    const projects = asItems(body, "projects")
    return { projects, count: projects.length }
  },
})

export const projectGetTool = defineTool({
  name: "project_get",
  title: "Obter projeto",
  description: "Devolve o registro do projeto.",
  readOnly: true,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
  }),
  returns: "project: registro do projeto.",
  errors: [401, 404],
  handler: async (args, ctx) => {
    const body = await ctx.client.request({
      method: "GET",
      path: `/api/projects/${args.projectId}`,
    })
    return { project: (body as Record<string, unknown>).project ?? null }
  },
})

export const projectOverviewTool = defineTool({
  name: "project_overview",
  title: "Visão geral do projeto",
  description:
    "Compõe projeto, membros, entregáveis, atividades, tarefas, horas e relatórios técnicos numa chamada. " +
    "Cada seção opcional que falhar vira um item em warnings; o projeto é o pivô e falha a tool inteira.",
  readOnly: true,
  inputSchema: z.object({
    projectId: z.number().int().positive(),
    sections: z.array(z.enum(PROJECT_OVERVIEW_SECTIONS)).optional(),
  }),
  returns:
    "project + as seções pedidas (members, deliverables, activities, tasks, hours, technicalReports, stats) + warnings.",
  errors: [401, 404],
  handler: async (args, ctx) => {
    const projectBody = await ctx.client.request({
      method: "GET",
      path: `/api/projects/${args.projectId}`,
    })
    const project = (projectBody as Record<string, unknown>).project ?? projectBody

    const requested = new Set<ProjectOverviewSection>(
      args.sections ?? PROJECT_OVERVIEW_SECTIONS,
    )
    const needsTasks = requested.has("tasks") || requested.has("stats")
    const needsHours = requested.has("hours") || requested.has("stats")
    const needsMembers = requested.has("members") || requested.has("stats")

    const sectionsToLoad: ProjectOverviewSection[] = []
    for (const section of [
      "members",
      "deliverables",
      "activities",
      "tasks",
      "hours",
      "technicalReports",
    ] as ProjectOverviewSection[]) {
      if (requested.has(section)) sectionsToLoad.push(section)
    }
    if (needsTasks && !sectionsToLoad.includes("tasks")) sectionsToLoad.push("tasks")
    if (needsHours && !sectionsToLoad.includes("hours")) sectionsToLoad.push("hours")
    if (needsMembers && !sectionsToLoad.includes("members")) sectionsToLoad.push("members")

    const settled = await Promise.allSettled(
      sectionsToLoad.map((section) => loadSection(ctx.client, args.projectId, section)),
    )

    const loaded = new Map<ProjectOverviewSection, unknown>()
    const warnings: SectionFailure[] = []
    settled.forEach((result, index) => {
      const section = sectionsToLoad[index]
      if (section === undefined) return
      if (result.status === "fulfilled") {
        loaded.set(section, result.value)
        return
      }
      const error = toToolErrorContent(result.reason)
      warnings.push({ section, ...error })
    })

    const output: Record<string, unknown> = { project, warnings }
    if (requested.has("members")) output.members = asItems(loaded.get("members"), "members")
    if (requested.has("deliverables")) {
      output.deliverables = asItems(loaded.get("deliverables"), "deliverables")
    }
    if (requested.has("activities")) {
      const cronograma = asRecord(loaded.get("activities"))
      output.activities = cronograma.cronograma ?? cronograma
    }
    if (requested.has("tasks")) output.tasks = asItems(loaded.get("tasks"), "tasks")
    if (requested.has("hours")) output.hours = asRecord(loaded.get("hours")).hours ?? loaded.get("hours") ?? null
    if (requested.has("technicalReports")) {
      output.technicalReports = asItems(loaded.get("technicalReports"), "reports")
    }
    if (requested.has("stats")) {
      const tasks = asItems(loaded.get("tasks"), "tasks")
      const hours = asRecord(asRecord(loaded.get("hours")).hours)
      const members = asItems(loaded.get("members"), "members")
      output.stats = {
        members: members.length,
        tasks: tasks.length,
        taskCounts: countByStatus(tasks),
        completedTasks: tasks.filter((task) => asRecord(task).status === "done").length,
        totalHours: typeof hours.totalHours === "number" ? hours.totalHours : null,
        sessionCount: typeof hours.sessionCount === "number" ? hours.sessionCount : null,
      }
    }

    return output
  },
})

export const memberPerformanceTool = defineTool({
  name: "member_performance",
  title: "Desempenho de uma pessoa",
  description:
    "Pessoa, tarefas concluídas, pontos, horas, sessões, relatórios e posição no ranking. " +
    "weekStart/weekEnd recortam só horas e relatórios: sessões e tarefas não aceitam filtro de data.",
  readOnly: true,
  inputSchema: z.object({
    userId: z.number().int().positive(),
    projectId: z.number().int().positive().optional(),
    weekStart: z.string().optional(),
    weekEnd: z.string().optional(),
  }),
  returns:
    "user, tasks, completedTasks, points, hours, sessions, weeklyReports, rankingPosition e warnings.",
  errors: [401, 403],
  handler: async (args, ctx) => {
    const client = ctx.client
    const hoursCall = args.projectId
      ? client.request({
          method: "GET",
          path: `/api/projects/${args.projectId}/hours`,
          query: { weekStart: args.weekStart, weekEnd: args.weekEnd },
        })
      : Promise.resolve(null)

    const settled = await Promise.allSettled([
      client.request({ method: "GET", path: "/api/users" }),
      client.request({
        method: "GET",
        path: "/api/tasks",
        query: { projectId: args.projectId },
      }),
      hoursCall,
      client.request({
        method: "GET",
        path: "/api/work-sessions",
        query: { userId: args.userId, projectId: args.projectId },
      }),
      client.request({
        method: "GET",
        path: "/api/weekly-reports",
        query: { userId: args.userId, weekStart: args.weekStart, weekEnd: args.weekEnd },
      }),
      client.request({
        method: "GET",
        path: "/api/users/leaderboard",
        query: { type: "points" },
      }),
    ])

    const warnings: Array<{ section: string } & ToolErrorContent> = []
    const value = <T>(index: number, section: string): T | null => {
      const result = settled[index]
      if (!result || result.status === "rejected") {
        if (result?.status === "rejected") {
          const error = toToolErrorContent(result.reason)
          warnings.push({ section, ...error })
        }
        return null
      }
      return result.value as T
    }

    const users = sanitizeUsers(asItems(value(0, "people_list"), "users"))
    const user = users.find((entry) => entry.id === args.userId) ?? null

    const tasks = asItems(value(1, "task_list"), "tasks").filter((task) => {
      const record = asRecord(task)
      const assignedTo = record.assignedTo
      const assignees = asArray(record.assignees).map((entry) => asRecord(entry).id)
      return assignedTo === args.userId || assignees.includes(args.userId)
    })
    const completedTasks = tasks.filter((task) => asRecord(task).status === "done")

    const hoursBody = asRecord(value(2, "hours_get"))
    const hours = asRecord(hoursBody.hours)
    const hoursByUser = asArray(hours.hoursByUser).find(
      (entry) => asRecord(entry).userId === args.userId,
    )

    const sessions = asArray(value(3, "work_sessions_list"))
    const weeklyReports = asItems(value(4, "weekly_report_list"), "weeklyReports")
    const ranking = asItems(value(5, "leaderboard_get"), "users")
    const rankingIndex = ranking.findIndex((entry) => asRecord(entry).id === args.userId)

    return {
      user,
      tasks,
      completedTasks,
      taskCount: tasks.length,
      completedTaskCount: completedTasks.length,
      points: user?.points ?? null,
      hours: hoursByUser ?? null,
      totalHours: typeof hours.totalHours === "number" ? hours.totalHours : null,
      sessions,
      sessionCount: sessions.length,
      weeklyReports,
      rankingPosition: rankingIndex >= 0 ? rankingIndex + 1 : null,
      warnings,
    }
  },
})
