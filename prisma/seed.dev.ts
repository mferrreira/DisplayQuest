import { assertSeedAllowed } from "./guard"

// A6 (2026-08-29): seed de desenvolvimento SÓ roda com NODE_ENV=development.
// Mantida como primeira instrução: aborta antes do PrismaClient e do resetDatabase.
assertSeedAllowed()

import { Prisma, PrismaClient, type UserRole } from "@prisma/client"
import * as bcrypt from "bcryptjs"

const prisma = new PrismaClient()

const DAY = 24 * 60 * 60 * 1000

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY)
}

async function resetDatabase() {
  // Ordem importa por causa das FKs.
  await prisma.notifications.deleteMany()
  await prisma.user_badges.deleteMany()
  await prisma.badges.deleteMany()
  await prisma.work_session_tasks.deleteMany()
  await (prisma as any).task_user_progress?.deleteMany?.()
  await (prisma as any).task_assignees?.deleteMany?.()
  await prisma.daily_logs.deleteMany()
  await prisma.weekly_reports.deleteMany()
  await prisma.weekly_hours_history.deleteMany()
  await prisma.lab_events.deleteMany()
  await prisma.lab_responsibilities.deleteMany()
  await prisma.user_schedules.deleteMany()
  await prisma.laboratory_schedules.deleteMany()
  await prisma.history.deleteMany()
  await prisma.issues.deleteMany()
  await prisma.purchases.deleteMany()
  await prisma.rewards.deleteMany()
  await prisma.tasks.deleteMany()
  await prisma.work_sessions.deleteMany()
  await prisma.project_members.deleteMany()
  await prisma.kanban_boards.deleteMany()
  await prisma.projects.deleteMany()
  await prisma.users.deleteMany()
}

async function main() {
  console.log("🌱 Resetando banco para seed completa...")
  await resetDatabase()

  const now = new Date()
  const password = await bcrypt.hash("123", 10)

  const userSpecs: Array<{
    key: string
    name: string
    email: string
    roles: UserRole[]
    status: string
    weekHours: number
    currentWeekHours: number
    points: number
    completedTasks: number
    bio: string
    avatar: string
    profileVisibility: "public" | "members_only" | "private"
  }> = [
    {
      key: "coord",
      name: "Marina Coordenadora",
      email: "coordenador@lab.com",
      roles: ["COORDENADOR"],
      status: "active",
      weekHours: 40,
      currentWeekHours: 26,
      points: 1800,
      completedTasks: 42,
      bio: "Coordena operações do laboratório e supervisiona projetos.",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Marina",
      profileVisibility: "public",
    },
    {
      key: "manager",
      name: "Carlos Gerente",
      email: "gerente@lab.com",
      roles: ["GERENTE"],
      status: "active",
      weekHours: 40,
      currentWeekHours: 24,
      points: 1600,
      completedTasks: 34,
      bio: "Gerente administrativo e de pessoas do laboratório.",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Carlos",
      profileVisibility: "members_only",
    },
    {
      key: "labtech",
      name: "Paula Laboratorista",
      email: "laboratorista@lab.com",
      roles: ["LABORATORISTA"],
      status: "active",
      weekHours: 36,
      currentWeekHours: 30,
      points: 1200,
      completedTasks: 27,
      bio: "Cuida da infraestrutura física do laboratório.",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Paula",
      profileVisibility: "public",
    },
    {
      key: "researcher",
      name: "Igor Pesquisador",
      email: "pesquisador@lab.com",
      roles: ["PESQUISADOR"],
      status: "active",
      weekHours: 30,
      currentWeekHours: 18,
      points: 980,
      completedTasks: 19,
      bio: "Pesquisador em IA aplicada e análise de dados.",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Igor",
      profileVisibility: "public",
    },
    {
      key: "project_manager",
      name: "Joana Líder de Projeto",
      email: "gerente_projeto@lab.com",
      roles: ["GERENTE_PROJETO"],
      status: "active",
      weekHours: 32,
      currentWeekHours: 20,
      points: 1120,
      completedTasks: 23,
      bio: "Lidera o projeto de gestão de laboratório.",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Joana",
      profileVisibility: "members_only",
    },
    {
      key: "collaborator",
      name: "Rafa Colaborador",
      email: "colaborador@lab.com",
      roles: ["COLABORADOR"],
      status: "active",
      weekHours: 20,
      currentWeekHours: 14,
      points: 540,
      completedTasks: 11,
      bio: "Colaborador técnico em interfaces e QA.",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Rafa",
      profileVisibility: "public",
    },
    {
      key: "vol1",
      name: "Joana Voluntária",
      email: "joana.voluntaria@lab.com",
      roles: ["VOLUNTARIO"],
      status: "active",
      weekHours: 12,
      currentWeekHours: 8,
      points: 430,
      completedTasks: 9,
      bio: "Apoia documentação e testes manuais.",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=JoanaVol",
      profileVisibility: "public",
    },
    {
      key: "vol2",
      name: "Juninho Voluntário",
      email: "juninho.voluntario@lab.com",
      roles: ["VOLUNTARIO", "COLABORADOR"],
      status: "active",
      weekHours: 16,
      currentWeekHours: 10,
      points: 620,
      completedTasks: 14,
      bio: "Atua em automações e apoio ao time de desenvolvimento.",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Juninho",
      profileVisibility: "members_only",
    },
    {
      key: "pending",
      name: "Nina Pendente",
      email: "pendente@lab.com",
      roles: ["VOLUNTARIO"],
      status: "pending",
      weekHours: 8,
      currentWeekHours: 0,
      points: 0,
      completedTasks: 0,
      bio: "Usuária pendente para validar fluxo de aprovação.",
      avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Nina",
      profileVisibility: "private",
    },
  ]

  const usersByKey = new Map<string, any>()
  for (const spec of userSpecs) {
    const user = await prisma.users.create({
      data: {
        name: spec.name,
        email: spec.email,
        password,
        roles: spec.roles,
        status: spec.status,
        weekHours: spec.weekHours,
        currentWeekHours: spec.currentWeekHours,
        points: spec.points,
        completedTasks: spec.completedTasks,
        bio: spec.bio,
        avatar: spec.avatar,
        profileVisibility: spec.profileVisibility,
        createdAt: addDays(now, -30 + userSpecs.indexOf(spec)),
      },
    })
    usersByKey.set(spec.key, user)
  }

  const coord = usersByKey.get("coord")
  const manager = usersByKey.get("manager")
  const labtech = usersByKey.get("labtech")
  const researcher = usersByKey.get("researcher")
  const projectLead = usersByKey.get("project_manager")
  const collaborator = usersByKey.get("collaborator")
  const vol1 = usersByKey.get("vol1")
  const vol2 = usersByKey.get("vol2")
  const pending = usersByKey.get("pending")

  const projectA = await prisma.projects.create({
    data: {
      name: "Sistema de Gestão do Laboratório",
      description: "Projeto principal do sistema interno do laboratório.",
      createdAt: addDays(now, -20).toISOString(),
      createdBy: coord.id,
      leaderId: projectLead.id,
      status: "active",
      links: [
        { label: "GitHub", url: "https://github.com/lab/displayquest" },
        { label: "Docs", url: "https://docs.lab.local/displayquest" },
      ],
    },
  })

  const projectB = await prisma.projects.create({
    data: {
      name: "Pesquisa em IA Aplicada",
      description: "Experimentos, datasets e relatórios do grupo de IA.",
      createdAt: addDays(now, -18).toISOString(),
      createdBy: manager.id,
      leaderId: researcher.id,
      status: "active",
      links: [{ label: "Pasta compartilhada", url: "https://drive.lab.local/ia" }],
    },
  })

  const projectC = await prisma.projects.create({
    data: {
      name: "Automação de Processos",
      description: "Automação de rotinas internas e integrações.",
      createdAt: addDays(now, -15).toISOString(),
      createdBy: coord.id,
      leaderId: manager.id,
      status: "archived",
      links: [],
    },
  })

  const memberships = [
    [projectA, coord, ["COORDENADOR"]],
    [projectA, projectLead, ["GERENTE_PROJETO"]],
    [projectA, collaborator, ["COLABORADOR"]],
    [projectA, vol1, ["VOLUNTARIO"]],
    [projectA, vol2, ["VOLUNTARIO", "COLABORADOR"]],
    [projectB, researcher, ["PESQUISADOR"]],
    [projectB, manager, ["GERENTE"]],
    [projectB, vol1, ["VOLUNTARIO"]],
    [projectB, vol2, ["VOLUNTARIO"]],
    [projectC, manager, ["GERENTE"]],
    [projectC, labtech, ["LABORATORISTA"]],
    [projectC, collaborator, ["COLABORADOR"]],
  ] as const

  for (const [project, user, roles] of memberships) {
    await prisma.project_members.create({
      data: {
        projectId: project.id,
        userId: user.id,
        roles: [...roles] as UserRole[],
        joinedAt: addDays(now, -14 + Math.floor(Math.random() * 4)),
      },
    })
  }

  await prisma.kanban_boards.createMany({
    data: [
      { name: "Kanban Lab Geral", labId: 1 },
      { name: "Kanban Projeto Gestão", labId: projectA.id },
      { name: "Kanban Projeto IA", labId: projectB.id },
    ],
  })

  await prisma.laboratory_schedules.createMany({
    data: [
      { dayOfWeek: 1, startTime: "08:00", endTime: "18:00", notes: "Plantão geral" },
      { dayOfWeek: 2, startTime: "08:00", endTime: "18:00", notes: "Atendimento presencial" },
      { dayOfWeek: 3, startTime: "08:00", endTime: "18:00", notes: "Manutenção leve" },
      { dayOfWeek: 4, startTime: "08:00", endTime: "18:00", notes: "Dia de projetos" },
      { dayOfWeek: 5, startTime: "08:00", endTime: "17:00", notes: "Fechamento da semana" },
    ],
  })

  await prisma.user_schedules.createMany({
    data: [
      { userId: coord.id, dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
      { userId: coord.id, dayOfWeek: 3, startTime: "14:00", endTime: "18:00" },
      { userId: projectLead.id, dayOfWeek: 2, startTime: "10:00", endTime: "16:00" },
      { userId: researcher.id, dayOfWeek: 4, startTime: "09:00", endTime: "15:00" },
      { userId: vol1.id, dayOfWeek: 5, startTime: "13:00", endTime: "17:00" },
      { userId: vol2.id, dayOfWeek: 2, startTime: "13:00", endTime: "18:00" },
    ],
  })

  await prisma.rewards.createMany({
    data: [
      { name: "Café", description: "Uma xícara de café", price: 10, available: true },
      { name: "Caneca do Lab", description: "Caneca personalizada", price: 50, available: true },
      { name: "Camiseta", description: "Camiseta oficial do laboratório", price: 120, available: true },
      { name: "Voucher Livraria", description: "Voucher para livros técnicos", price: 200, available: false },
    ],
  })

  const rewards = await prisma.rewards.findMany()
  const rewardCoffee = rewards.find((r) => r.name === "Café") ?? rewards[0]
  const rewardMug = rewards.find((r) => r.name === "Caneca do Lab") ?? rewards[1]

  await prisma.purchases.createMany({
    data: [
      {
        userId: vol1.id,
        rewardId: rewardCoffee.id,
        rewardName: rewardCoffee.name,
        price: rewardCoffee.price,
        purchaseDate: addDays(now, -6).toISOString(),
        status: "approved",
      },
      {
        userId: vol2.id,
        rewardId: rewardMug.id,
        rewardName: rewardMug.name,
        price: rewardMug.price,
        purchaseDate: addDays(now, -3).toISOString(),
        status: "pending",
      },
    ],
  })

  const tasks = await Promise.all([
    prisma.tasks.create({
      data: {
        title: "Refatorar tela de projetos",
        description: "Ajustar filtros, paginação e organização visual.",
        status: "in-progress",
        priority: "high",
        assignedTo: collaborator.id,
        projectId: projectA.id,
        dueDate: addDays(now, 4).toISOString(),
        points: 100,
        completed: false,
        taskVisibility: "delegated",
        isGlobal: false,
      },
    }),
    prisma.tasks.create({
      data: {
        title: "Auditar permissões do backend",
        description: "Revisar endpoints críticos e guards.",
        status: "to-do",
        priority: "medium",
        assignedTo: projectLead.id,
        projectId: projectA.id,
        dueDate: addDays(now, 7).toISOString(),
        points: 80,
        completed: false,
        taskVisibility: "delegated",
        isGlobal: false,
      },
    }),
    prisma.tasks.create({
      data: {
        title: "Checklist de onboarding do projeto",
        description: "Task pública de projeto com progresso individual.",
        status: "to-do",
        priority: "medium",
        projectId: projectA.id,
        dueDate: addDays(now, 10).toISOString(),
        points: 40,
        completed: false,
        taskVisibility: "public",
        isGlobal: false,
      },
    }),
    prisma.tasks.create({
      data: {
        title: "Configurar ambiente local",
        description: "Quest pública do laboratório (global) com conclusão individual.",
        status: "to-do",
        priority: "low",
        dueDate: addDays(now, 12).toISOString(),
        points: 25,
        completed: false,
        taskVisibility: "public",
        isGlobal: true,
      },
    }),
    prisma.tasks.create({
      data: {
        title: "Padronizar nomenclatura de datasets",
        description: "Task privada para organização interna do projeto de IA.",
        status: "adjust",
        priority: "medium",
        assignedTo: researcher.id,
        projectId: projectB.id,
        dueDate: addDays(now, 5).toISOString(),
        points: 60,
        completed: false,
        taskVisibility: "private",
        isGlobal: false,
      },
    }),
    prisma.tasks.create({
      data: {
        title: "Planejamento da sprint anterior",
        description: "Exemplo de task concluída",
        status: "done",
        priority: "high",
        assignedTo: projectLead.id,
        projectId: projectA.id,
        dueDate: addDays(now, -2).toISOString(),
        points: 90,
        completed: true,
        completedAt: addDays(now, -1),
        taskVisibility: "delegated",
        isGlobal: false,
      },
    }),
  ])

  const [
    taskRefactor,
    taskPerms,
    taskOnboardingPublicProject,
    taskGlobalSetup,
    taskPrivateIA,
    taskDone,
  ] = tasks

  const taskAssigneesTable = (prisma as any).task_assignees
  if (taskAssigneesTable) {
    await taskAssigneesTable.createMany({
      data: [
        { taskId: taskRefactor.id, userId: collaborator.id, assignedBy: projectLead.id },
        { taskId: taskPerms.id, userId: projectLead.id, assignedBy: coord.id },
        { taskId: taskPerms.id, userId: vol2.id, assignedBy: coord.id }, // multiatribuição
        { taskId: taskPrivateIA.id, userId: researcher.id, assignedBy: manager.id },
        { taskId: taskDone.id, userId: projectLead.id, assignedBy: coord.id },
      ],
      skipDuplicates: true,
    })
  }

  const taskProgressTable = (prisma as any).task_user_progress
  if (taskProgressTable) {
    await taskProgressTable.createMany({
      data: [
        {
          taskId: taskOnboardingPublicProject.id,
          userId: vol1.id,
          status: "done",
          pickedAt: addDays(now, -4),
          completedAt: addDays(now, -3),
          awardedPoints: 40,
          createdAt: addDays(now, -4),
        },
        {
          taskId: taskOnboardingPublicProject.id,
          userId: vol2.id,
          status: "in-progress",
          pickedAt: addDays(now, -2),
          completedAt: null,
          awardedPoints: 0,
          createdAt: addDays(now, -2),
        },
        {
          taskId: taskOnboardingPublicProject.id,
          userId: collaborator.id,
          status: "to-do",
          pickedAt: null,
          completedAt: null,
          awardedPoints: 0,
          createdAt: addDays(now, -1),
        },
        {
          taskId: taskGlobalSetup.id,
          userId: vol1.id,
          status: "done",
          pickedAt: addDays(now, -7),
          completedAt: addDays(now, -6),
          awardedPoints: 25,
          createdAt: addDays(now, -7),
        },
        {
          taskId: taskGlobalSetup.id,
          userId: vol2.id,
          status: "done",
          pickedAt: addDays(now, -5),
          completedAt: addDays(now, -5),
          awardedPoints: 25,
          createdAt: addDays(now, -5),
        },
        {
          taskId: taskGlobalSetup.id,
          userId: collaborator.id,
          status: "in-review",
          pickedAt: addDays(now, -1),
          completedAt: null,
          awardedPoints: 0,
          createdAt: addDays(now, -1),
        },
      ],
    })
  }

  const completedSession = await prisma.work_sessions.create({
    data: {
      userId: vol1.id,
      userName: vol1.name,
      startTime: addDays(now, -3),
      endTime: addDays(now, -3 + 0), // overwritten below by explicit duration semantics
      duration: 120,
      activity: "Implementação frontend",
      location: "Lab 01",
      projectId: projectA.id,
      status: "completed",
      createdAt: addDays(now, -3),
    },
  })

  const completedSession2 = await prisma.work_sessions.create({
    data: {
      userId: vol2.id,
      userName: vol2.name,
      startTime: addDays(now, -2),
      endTime: addDays(now, -2),
      duration: 95,
      activity: "Revisão de tarefas públicas",
      location: "Remoto",
      projectId: projectA.id,
      status: "completed",
      createdAt: addDays(now, -2),
    },
  })

  const activeSession = await prisma.work_sessions.create({
    data: {
      userId: collaborator.id,
      userName: collaborator.name,
      startTime: addDays(now, 0),
      endTime: null,
      duration: null,
      activity: "Refatoração backend",
      location: "Lab 02",
      projectId: projectA.id,
      status: "active",
      createdAt: now,
    },
  })

  await prisma.work_session_tasks.createMany({
    data: [
      { workSessionId: completedSession.id, taskId: taskOnboardingPublicProject.id },
      { workSessionId: completedSession.id, taskId: taskGlobalSetup.id },
      { workSessionId: completedSession2.id, taskId: taskGlobalSetup.id },
      { workSessionId: activeSession.id, taskId: taskRefactor.id },
    ],
    skipDuplicates: true,
  })

  const dailyLog1 = await prisma.daily_logs.create({
    data: {
      userId: vol1.id,
      projectId: projectA.id,
      date: addDays(now, -3),
      note: "Concluí checklist de onboarding e revisei pendências do quadro.",
      createdAt: addDays(now, -3),
      workSessionId: completedSession.id,
    },
  })

  const dailyLog2 = await prisma.daily_logs.create({
    data: {
      userId: vol2.id,
      projectId: projectA.id,
      date: addDays(now, -2),
      note: "Avancei em ajustes de permissão e documentação da API.",
      createdAt: addDays(now, -2),
      workSessionId: completedSession2.id,
    },
  })

  await prisma.weekly_reports.createMany({
    data: [
      {
        userId: vol1.id,
        userName: vol1.name,
        weekStart: addDays(now, -7),
        weekEnd: addDays(now, -1),
        totalLogs: 3,
        summary: "Boa evolução no projeto A com foco em onboarding e QA.",
        createdAt: addDays(now, -1),
      },
      {
        userId: vol2.id,
        userName: vol2.name,
        weekStart: addDays(now, -7),
        weekEnd: addDays(now, -1),
        totalLogs: 2,
        summary: "Atuou em tarefas públicas e revisão de permissões.",
        createdAt: addDays(now, -1),
      },
    ],
  })

  await prisma.weekly_hours_history.createMany({
    data: [
      {
        userId: vol1.id,
        userName: vol1.name,
        weekStart: addDays(now, -7),
        weekEnd: addDays(now, -1),
        totalHours: 7.5,
        createdAt: addDays(now, -1),
      },
      {
        userId: vol2.id,
        userName: vol2.name,
        weekStart: addDays(now, -7),
        weekEnd: addDays(now, -1),
        totalHours: 8.25,
        createdAt: addDays(now, -1),
      },
    ],
  })

  await prisma.lab_events.createMany({
    data: [
      {
        userId: coord.id,
        userName: coord.name,
        date: addDays(now, -5),
        note: "Reunião de alinhamento semanal com lideranças.",
        createdAt: addDays(now, -5),
      },
      {
        userId: labtech.id,
        userName: labtech.name,
        date: addDays(now, -4),
        note: "Manutenção preventiva dos equipamentos do laboratório.",
        createdAt: addDays(now, -4),
      },
    ],
  })

  await prisma.lab_responsibilities.createMany({
    data: [
      {
        userId: labtech.id,
        userName: labtech.name,
        startTime: addDays(now, -1).toISOString(),
        endTime: now.toISOString(),
        notes: "Acompanhamento de uso do laboratório durante expediente.",
      },
      {
        userId: vol1.id,
        userName: vol1.name,
        startTime: addDays(now, 0).toISOString(),
        endTime: null,
        notes: "Responsável pelo fechamento e checklist do turno.",
      },
    ],
  })

  const badges = await Promise.all([
    prisma.badges.create({
      data: {
        name: "Primeiras Tasks",
        description: "Concluiu as primeiras tarefas no sistema.",
        icon: "sparkles",
        color: "#22c55e",
        category: "achievement",
        criteria: { tasks: 5 },
        isActive: true,
        createdBy: coord.id,
        createdAt: addDays(now, -20),
      },
    }),
    prisma.badges.create({
      data: {
        name: "Semana Produtiva",
        description: "Atingiu carga horária semanal planejada.",
        icon: "timer",
        color: "#3b82f6",
        category: "milestone",
        criteria: { weeklyHours: 8 },
        isActive: true,
        createdBy: manager.id,
        createdAt: addDays(now, -18),
      },
    }),
  ])

  await prisma.user_badges.createMany({
    data: [
      {
        userId: vol1.id,
        badgeId: badges[0].id,
        earnedAt: addDays(now, -3),
        earnedBy: coord.id,
      },
      {
        userId: vol2.id,
        badgeId: badges[1].id,
        earnedAt: addDays(now, -2),
        earnedBy: manager.id,
      },
    ],
    skipDuplicates: true,
  })

  await prisma.issues.createMany({
    data: [
      {
        title: "Impressora do laboratório não responde",
        description: "Fila trava ao enviar PDF.",
        status: "open",
        priority: "medium",
        category: "equipment",
        reporterId: vol1.id,
        assigneeId: labtech.id,
        createdAt: addDays(now, -2),
      },
      {
        title: "Erro 500 ao listar tarefas",
        description: "Falha intermitente na rota /api/tasks.",
        status: "in_progress",
        priority: "high",
        category: "software",
        reporterId: collaborator.id,
        assigneeId: projectLead.id,
        createdAt: addDays(now, -1),
      },
      {
        title: "Queda de rede no laboratório B",
        description: "Instabilidade na parte da tarde.",
        status: "resolved",
        priority: "urgent",
        category: "network",
        reporterId: labtech.id,
        assigneeId: manager.id,
        createdAt: addDays(now, -6),
        resolvedAt: addDays(now, -5),
      },
      {
        title: "Solicitação de cadeira ergonômica",
        description: "Ajuste ergonômico para posto de trabalho.",
        status: "closed",
        priority: "low",
        category: "other",
        reporterId: vol2.id,
        assigneeId: coord.id,
        createdAt: addDays(now, -10),
        resolvedAt: addDays(now, -8),
      },
    ],
  })

  await prisma.history.createMany({
    data: [
      {
        entityType: "task",
        entityId: taskRefactor.id,
        action: "UPDATE_STATUS",
        performedBy: collaborator.id,
        performedAt: addDays(now, -1),
        oldValues: { status: "to-do" },
        newValues: { status: "in-progress" },
        description: "Iniciou implementação da refatoração da tela de projetos.",
        metadata: { source: "kanban", taskVisibility: "delegated" },
      },
      {
        entityType: "project",
        entityId: projectA.id,
        action: "ADD_MEMBER",
        performedBy: coord.id,
        performedAt: addDays(now, -12),
        oldValues: Prisma.JsonNull,
        newValues: { userId: vol1.id, roles: ["VOLUNTARIO"] },
        description: "Voluntária adicionada ao projeto.",
        metadata: { projectName: projectA.name },
      },
      {
        entityType: "user",
        entityId: pending.id,
        action: "REGISTER",
        performedBy: pending.id,
        performedAt: addDays(now, -1),
        oldValues: Prisma.JsonNull,
        newValues: { status: "pending" },
        description: "Usuária cadastrada aguardando aprovação.",
        metadata: { email: pending.email },
      },
    ],
  })

  await prisma.notifications.createMany({
    data: [
      {
        userId: projectLead.id,
        type: "TASK_REVIEW_REQUEST",
        title: "Tarefa em revisão",
        message: `${vol2.name} enviou task para revisão.`,
        data: JSON.stringify({ taskId: taskPerms.id, status: "in-review" }),
        read: false,
        createdAt: addDays(now, -1),
      },
      {
        userId: vol1.id,
        type: "TASK_APPROVED",
        title: "Task aprovada",
        message: "Sua task pública foi concluída com sucesso.",
        data: JSON.stringify({ taskId: taskOnboardingPublicProject.id, points: 40 }),
        read: true,
        readAt: addDays(now, -3),
        createdAt: addDays(now, -3),
      },
      {
        userId: coord.id,
        type: "SYSTEM",
        title: "Seed carregada",
        message: "Ambiente de demonstração populado com sucesso.",
        data: JSON.stringify({ seedVersion: "full-demo-v1" }),
        read: false,
        createdAt: now,
      },
    ],
  })

  console.log("✅ Seed completa finalizada")
  console.log(`Usuários: ${await prisma.users.count()}`)
  console.log(`Projetos: ${await prisma.projects.count()}`)
  console.log(`Tasks: ${await prisma.tasks.count()}`)
  console.log(`Responsabilidades: ${await prisma.lab_responsibilities.count()}`)
  console.log(`Work sessions: ${await prisma.work_sessions.count()}`)
}

main()
  .catch((error) => {
    console.error("❌ Erro na seed:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
