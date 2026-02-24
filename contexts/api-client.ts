// Cliente de API para fazer chamadas aos endpoints

// Função genérica para fazer requisições
export async function fetchAPI<T>(url: string, options: RequestInit = {}): Promise<T> {
  console.log(`🔍 API Call: ${options.method || 'GET'} ${url}`)

  const headers = new Headers(options.headers || {})
  const isFormDataBody = typeof FormData !== "undefined" && options.body instanceof FormData
  if (!isFormDataBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers,
  })

  const contentType = response.headers.get("content-type") || ""
  const isJson = contentType.includes("application/json")
  let data: any = null

  if (response.status !== 204) {
    if (isJson) {
      data = await response.json()
    } else {
      const text = await response.text()
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          data = text
        }
      }
    }
  }

  if (!response.ok) {
    console.error(`❌ API Error: ${options.method || 'GET'} ${url}`, {
      status: response.status,
      statusText: response.statusText,
      error: data?.error,
      data
    })
    throw new Error((typeof data?.error === "string" && data.error) || "Ocorreu um erro na requisição")
  }

  console.log(`✅ API Success: ${options.method || 'GET'} ${url}`)
  return (data?.data || data || {}) as T
}

// API de Tarefas
export const TasksAPI = {
  // Obter todas as tarefas
  getAll: (params?: string) => fetchAPI<{ tasks: any[] }>(`/api/tasks${params || ""}`),

  // Obter uma tarefa específica
  getById: (id: number) => fetchAPI<{ task: any }>(`/api/tasks/${id}`),

  // Criar uma nova tarefa
  create: (task: any) =>
    fetchAPI<{ task: any }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(task),
    }),

  createBacklog: (tasks: any[]) =>
    fetchAPI<{ tasks: any[]; createdCount: number }>("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ tasks }),
    }),

  // Atualizar uma tarefa
  update: (id: number, task: any, userId?: number) =>
    fetchAPI<{ task: any }>(`/api/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(userId ? { ...task, userId } : task),
    }),

  // Marcar uma tarefa como concluída
  complete: (id: number, userId?: number) =>
    fetchAPI<{ task: any }>(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(userId ? { action: "complete", userId } : { action: "complete" }),
    }),

  // Excluir uma tarefa
  delete: (id: number) =>
    fetchAPI<{ success: boolean }>(`/api/tasks/${id}`, {
      method: "DELETE",
    }),
}

// API de Usuários
export const UsersAPI = {
  // Obter todos os usuários
  getAll: () => fetchAPI<{ users: any[] }>("/api/users"),

  // Obter um usuário específico
  getById: (id: number) => fetchAPI<{ user: any }>(`/api/users/${id}`),

  // Criar um novo usuário
  create: (user: any) =>
    fetchAPI<{ user: any }>("/api/users", {
      method: "POST",
      body: JSON.stringify(user),
    }),

  // Atualizar um usuário
  update: (id: number, user: any) =>
    fetchAPI<{ user: any }>(`/api/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(user),
    }),

  // Adicionar pontos a um usuário
  addPoints: (id: number, points: number) =>
    fetchAPI<{ user: any }>(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "addPoints", points }),
    }),

  // Obter usuários pendentes
  getPendingUsers: () => fetchAPI<{ pendingUsers: any[] }>("/api/users/approve"),

  // Aprovar usuário
  approveUser: (userId: number) =>
    fetchAPI<{ user: any; message: string }>("/api/users/approve", {
      method: "POST",
      body: JSON.stringify({ userId, action: "approve" }),
    }),

  // Rejeitar usuário
  rejectPendingUser: (userId: number) =>
    fetchAPI<{ user: any; message: string }>("/api/users/approve", {
      method: "POST",
      body: JSON.stringify({ userId, action: "reject" }),
    }),

  // Atualizar roles do usuário
  updateUserRoles: (userId: number, roles: string[]) =>
    fetchAPI<{ user: any }>(`/api/users/${userId}/roles`, {
      method: "PATCH",
      body: JSON.stringify({ action: "set", roles }),
    }),

  // Atualizar carga horária do usuário
  updateUserWeekHours: (userId: number, weekHours: number) =>
    fetchAPI<{ user: any }>(`/api/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ weekHours }),
    }),

  // Adicionar usuário a projeto
  addUserToProject: (userId: number, projectId: number) =>
    fetchAPI<{ membership: any }>(`/api/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify({ userId, roles: ["COLABORADOR"] }),
    }),

  // Laboratory Schedule API
  getLaboratorySchedules: () => fetchAPI<{ schedules: any[] }>("/api/laboratory-schedule"),

  createLaboratorySchedule: (schedule: any) =>
    fetchAPI<{ schedule: any }>("/api/laboratory-schedule", {
      method: "POST",
      body: JSON.stringify(schedule),
    }),

  updateLaboratorySchedule: (id: number, schedule: any) =>
    fetchAPI<{ schedule: any }>(`/api/laboratory-schedule/${id}`, {
      method: "PUT",
      body: JSON.stringify(schedule),
    }),

  deleteLaboratorySchedule: (id: number) =>
    fetchAPI<{ message: string }>(`/api/laboratory-schedule/${id}`, {
      method: "DELETE",
    }),
}

// API de Projetos
export const ProjectsAPI = {
  // Obter todos os projetos
  getAll: () => fetchAPI<{ projects: any[] }>("/api/projects"),

  // Obter um projeto específico
  getById: (id: number) => fetchAPI<{ project: any }>(`/api/projects/${id}`),

  // Criar um novo projeto
  create: (project: any) =>
    fetchAPI<{ project: any }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(project),
    }),

  // Atualizar um projeto
  update: (id: number, project: any) =>
    fetchAPI<{ project: any }>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(project),
    }),

  // Excluir um projeto
  delete: (id: number) =>
    fetchAPI<{ success: boolean }>(`/api/projects/${id}`, {
      method: "DELETE",
    }),
}

// API de Recompensas
export const RewardsAPI = {
  // Obter todas as recompensas
  getAll: () => fetchAPI<{ rewards: any[] }>("/api/rewards"),

  // Obter uma recompensa específica
  getById: (id: number) => fetchAPI<{ reward: any }>(`/api/rewards/${id}`),

  // Criar uma nova recompensa
  create: (reward: any) =>
    fetchAPI<{ reward: any }>("/api/rewards", {
      method: "POST",
      body: JSON.stringify(reward),
    }),

  // Atualizar uma recompensa
  update: (id: number, reward: any) =>
    fetchAPI<{ reward: any }>(`/api/rewards/${id}`, {
      method: "PUT",
      body: JSON.stringify(reward),
    }),

  // Excluir uma recompensa
  delete: (id: number) =>
    fetchAPI<{ success: boolean }>(`/api/rewards/${id}`, {
      method: "DELETE",
    }),
}

// API de Compras
export const PurchasesAPI = {
  // Obter todas as compras
  getAll: (userId?: number) => {
    const url = userId ? `/api/purchases?userId=${userId}` : "/api/purchases"
    return fetchAPI<{ purchases: any[] }>(url)
  },

  // Obter uma compra específica
  getById: (id: number) => fetchAPI<{ purchase: any }>(`/api/purchases/${id}`),

  // Criar uma nova compra (resgatar recompensa)
  create: (purchase: { userId: number; rewardId: number }) =>
    fetchAPI<{ purchase: any }>("/api/purchases", {
      method: "POST",
      body: JSON.stringify(purchase),
    }),

  // Aprovar uma compra
  approve: (id: number) =>
    fetchAPI<{ purchase: any }>(`/api/purchases/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "approve" }),
    }),

  // Negar uma compra
  deny: (id: number) =>
    fetchAPI<{ purchase: any }>(`/api/purchases/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "deny" }),
    }),
}

// API de Responsabilidades do Laboratório
export const ResponsibilitiesAPI = {
  // Obter todas as responsabilidades
  getAll: (startDate?: string, endDate?: string) => {
    let url = "/api/responsibilities"
    if (startDate && endDate) {
      url += `?startDate=${startDate}&endDate=${endDate}`
    }
    return fetchAPI<{ responsibilities: any[] }>(url)
  },

  // Obter responsabilidade ativa
  getActive: () => fetchAPI<{ activeResponsibility: any | null }>("/api/responsibilities?active=true"),

  // Iniciar uma nova responsabilidade
  start: (data: { userId: number; userName: string; notes?: string }) =>
    fetchAPI<{ responsibility: any }>("/api/responsibilities", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Encerrar uma responsabilidade
  end: (id: number, userId?: number) =>
    fetchAPI<{ responsibility: any }>(`/api/responsibilities/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "end", userId }),
    }),

  // Atualizar notas de uma responsabilidade
  updateNotes: (id: number, notes: string) =>
    fetchAPI<{ responsibility: any }>(`/api/responsibilities/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "updateNotes", notes }),
    }),

  // Excluir uma responsabilidade
  delete: (id: number) =>
    fetchAPI<{ success: boolean }>(`/api/responsibilities/${id}`, {
      method: "DELETE",
    }),
}

// API de Logs Diários
export const DailyLogsAPI = {
  // Obter todos os logs
  getAll: (userId?: number, date?: string, projectId?: number) => {
    let url = "/api/daily_logs"
    const params = new URLSearchParams()
    if (userId) params.append("userId", userId.toString())
    if (date) params.append("date", date)
    if (projectId) params.append("projectId", projectId.toString())
    if (params.toString()) url += `?${params.toString()}`
    return fetchAPI<{ logs: any[] }>(url)
  },

  // Obter um log específico
  getById: (id: number) => fetchAPI<{ log: any }>(`/api/daily_logs/${id}`),

  // Criar um novo log
  create: (log: any) =>
    fetchAPI<{ log: any }>("/api/daily_logs", {
      method: "POST",
      body: JSON.stringify(log),
    }),

  // Atualizar um log
  update: (id: number, log: any) =>
    fetchAPI<{ log: any }>(`/api/daily_logs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(log),
    }),

  // Excluir um log
  delete: (id: number) =>
    fetchAPI<{ success: boolean }>(`/api/daily_logs/${id}`, {
      method: "DELETE",
    }),
}

// API de Horários dos Usuários
export const SchedulesAPI = {
  // Obter todos os horários
  getAll: (userId?: number) => {
    const url = userId ? `/api/schedules?userId=${userId}` : "/api/schedules"
    return fetchAPI<{ schedules: any[] }>(url)
  },

  // Obter um horário específico
  getById: (id: number) => fetchAPI<{ schedule: any }>(`/api/schedules/${id}`),

  // Criar um novo horário
  create: (schedule: any) =>
    fetchAPI<{ schedule: any }>("/api/schedules", {
      method: "POST",
      body: JSON.stringify(schedule),
    }),

  // Atualizar um horário
  update: (id: number, schedule: any) =>
    fetchAPI<{ schedule: any }>(`/api/schedules/${id}`, {
      method: "PUT",
      body: JSON.stringify(schedule),
    }),

  // Excluir um horário
  delete: (id: number) =>
    fetchAPI<{ success: boolean }>(`/api/schedules/${id}`, {
      method: "DELETE",
    }),
}

// API de Relatórios Semanais
export const WeeklyReportsAPI = {
  // Obter todos os relatórios semanais
  getAll: (userId?: number, weekStart?: string, weekEnd?: string) => {
    let url = "/api/weekly-reports"
    const params = new URLSearchParams()
    if (userId) params.append("userId", userId.toString())
    if (weekStart) params.append("weekStart", weekStart)
    if (weekEnd) params.append("weekEnd", weekEnd)
    if (params.toString()) url += `?${params.toString()}`
    return fetchAPI<{ weeklyReports: any[] }>(url)
  },

  // Obter um relatório específico
  getById: (id: number) => fetchAPI<{ weeklyReport: any }>(`/api/weekly-reports/${id}`),

  // Gerar relatório semanal (busca logs e cria relatório)
  generate: (userId: number, weekStart: string, weekEnd: string) =>
    fetchAPI<{ weeklyReport: any }>("/api/weekly-reports/generate", {
      method: "POST",
      body: JSON.stringify({ userId, weekStart, weekEnd }),
    }),

  // Criar um novo relatório semanal
  create: (report: any) =>
    fetchAPI<{ weeklyReport: any }>("/api/weekly-reports", {
      method: "POST",
      body: JSON.stringify(report),
    }),

  // Atualizar um relatório semanal
  update: (id: number, report: any) =>
    fetchAPI<{ weeklyReport: any }>(`/api/weekly-reports/${id}`, {
      method: "PUT",
      body: JSON.stringify(report),
    }),

  // Excluir um relatório semanal
  delete: (id: number) =>
    fetchAPI<{ success: boolean }>(`/api/weekly-reports/${id}`, {
      method: "DELETE",
    }),
}

// API de Sessões de Trabalho
export const WorkSessionsAPI = {
  // Obter todas as sessões
  getAll: (userId?: number, status?: string) => {
    let url = "/api/work-sessions"
    const params = new URLSearchParams()

    if (userId) params.append("userId", userId.toString())
    if (status) params.append("status", status)
    if (params.toString()) url += `?${params.toString()}`
    
    return fetchAPI<{ data: any[] }>(url)
  },

  // Obter uma sessão específica
  getById: (id: number) => fetchAPI<{ data: any }>(`/api/work-sessions/${id}`),

  // Iniciar uma nova sessão
  start: async (session: any) => {
    const res = await fetchAPI<{ data: any }>("/api/work-sessions", {
      method: "POST",
      body: JSON.stringify(session),
    })
    console.log(res)
    return res
  },

  // Atualizar uma sessão
  update: (id: number, session: any) =>
    fetchAPI<{ data: any }>(`/api/work-sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(session),
    }),

  // Excluir uma sessão
  delete: (id: number) =>
    fetchAPI<{ success: boolean }>(`/api/work-sessions/${id}`, {
      method: "DELETE",
    }),

  getActiveSessions: async () => {
    const result = await fetchAPI<{ data: any[] }>(`/api/work-sessions?active=true`)
    return Array.isArray(result) ? result : result.data
  },

  getWeeklyHours: async () => {

  },
}

// API de Eventos do Laboratório
export const LabEventsAPI = {
  getEventsByDate: (day: number, month: number, year: number) =>
    fetchAPI<{ events: any[] }>(`/api/lab-events?day=${day}&month=${month}&year=${year}`),
  createEvent: (event: { date: string; note: string }) =>
    fetchAPI<{ event: any }>(`/api/lab-events`, {
      method: "POST",
      body: JSON.stringify(event),
    }),
}

// API de Issues
export const IssuesAPI = {
  // Obter todos os issues
  getAll: (params?: string) => fetchAPI<{ issues: any[] }>(`/api/issues${params || ""}`),

  // Obter um issue específico
  getById: (id: number) => fetchAPI<{ issue: any }>(`/api/issues/${id}`),

  // Criar um novo issue
  create: (issue: any) =>
    fetchAPI<{ issue: any }>("/api/issues", {
      method: "POST",
      body: JSON.stringify(issue),
    }),

  // Atualizar um issue
  update: (id: number, issue: any) =>
    fetchAPI<{ issue: any }>(`/api/issues/${id}`, {
      method: "PUT",
      body: JSON.stringify(issue),
    }),

  // Atribuir issue a um usuário
  assign: (id: number, assignedTo: number) =>
    fetchAPI<{ issue: any }>(`/api/issues/${id}/assign`, {
      method: "POST",
      body: JSON.stringify({ assigneeId: assignedTo }),
    }),

  // Atualizar status do issue
  updateStatus: (id: number, status: string) => {
    const actionMap: { [key: string]: string } = {
      "in_progress": "start",
      "closed": "closed",
      "resolved": "resolve",
      "open": "reopen"
    };
    const action = actionMap[status] || status;
    return fetchAPI<{ issue: any }>(`/api/issues/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
  },

  // Resolver issue
  resolve: (id: number, resolution?: string) =>
    fetchAPI<{ issue: any }>(`/api/issues/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ resolution }),
    }),

  // Excluir um issue
  delete: (id: number) =>
    fetchAPI<{ success: boolean }>(`/api/issues/${id}`, {
      method: "DELETE",
    }),
}

// API de Badges
export const BadgesAPI = {
  // Obter todos os badges
  getAll: () => fetchAPI<{ badges: any[] }>("/api/badges"),

  // Obter um badge específico
  getById: (id: number) => fetchAPI<{ badge: any }>(`/api/badges/${id}`),

  // Criar um novo badge
  create: (badge: any) =>
    fetchAPI<{ badge: any }>("/api/badges", {
      method: "POST",
      body: JSON.stringify(badge),
    }),

  // Atualizar um badge
  update: (id: number, badge: any) =>
    fetchAPI<{ badge: any }>(`/api/badges/${id}`, {
      method: "PUT",
      body: JSON.stringify(badge),
    }),

  // Excluir um badge
  delete: (id: number) =>
    fetchAPI<{ success: boolean }>(`/api/badges/${id}`, {
      method: "DELETE",
    }),

  // Conceder badge a um usuário
  award: (userId: number, badgeId: number) =>
    fetchAPI<{ success: boolean }>("/api/badges/award", {
      method: "POST",
      body: JSON.stringify({ userId, badgeId }),
    }),

  // Obter badges de um usuário
  getUserBadges: (userId: number, limit?: number) => {
    const url = limit 
      ? `/api/user-badges?userId=${userId}&limit=${limit}`
      : `/api/user-badges?userId=${userId}`
    return fetchAPI<{ badges: any[]; recentBadges: any[]; count: number }>(url)
  },
}

// API de Perfis de Usuário
export const UserProfilesAPI = {
  // Obter perfil de um usuário
  getProfile: (userId: number) => fetchAPI<{ profile: any }>(`/api/users/${userId}/profile`),

  // Atualizar perfil de um usuário
  updateProfile: (userId: number, profileData: any) =>
    fetchAPI<{ user: any }>(`/api/users/${userId}/profile`, {
      method: "PATCH",
      body: JSON.stringify(profileData),
    }),

  // Buscar usuários por nome
  searchUsers: (query: string) => fetchAPI<{ users: any[] }>(`/api/users/search?q=${encodeURIComponent(query)}`),

  // Obter perfis públicos dos usuários
  getPublic: () => fetchAPI<{ users: any[] }>("/api/users/profiles?type=public"),

  // Obter perfis de membros
  getMembers: () => fetchAPI<{ users: any[] }>("/api/users/profiles?type=members"),

  // Obter avatar de um usuário
  getAvatar: (userId: number) => fetchAPI<{ avatar: string }>(`/api/users/${userId}/avatar`),

  // Atualizar avatar de um usuário
  updateAvatar: (userId: number, avatarData: FormData) =>
    fetchAPI<{ avatar: string }>(`/api/users/${userId}/avatar`, {
      method: "POST",
      body: avatarData,
    }),
}
