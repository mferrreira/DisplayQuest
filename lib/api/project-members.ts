export interface ProjectMember {
  id: number
  userId: number
  userName: string | null
  userEmail: string | null
  roles: string[]
  joinedAt: string
  totalHours?: number
  currentWeekHours?: number
}

export interface ProjectMemberCreateOrUpdate {
  id: number
  userId: number
  userName: string | null
  userEmail: string | null
  roles: string[]
  joinedAt: string
}

async function readJson(response: Response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

function buildErrorMessage(payload: any, fallback: string) {
  return typeof payload?.error === "string" && payload.error.length > 0 ? payload.error : fallback
}

export async function listProjectMembers(projectId: number): Promise<ProjectMember[]> {
  const response = await fetch(`/api/projects/${projectId}/members`)
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, "Erro ao buscar membros do projeto"))
  }

  return Array.isArray(payload?.members) ? payload.members : []
}

export async function addProjectMember(projectId: number, userId: number, roles: string[]) {
  const response = await fetch(`/api/projects/${projectId}/members`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "add",
      userId,
      roles,
    }),
  })
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, "Erro ao adicionar membro"))
  }

  return payload?.membership as ProjectMemberCreateOrUpdate
}

export async function removeProjectMember(projectId: number, membershipId: number) {
  const response = await fetch(`/api/projects/${projectId}/members`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "remove",
      membershipId,
    }),
  })
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, "Erro ao remover membro"))
  }

  return payload?.message as string | undefined
}

export async function setProjectMemberRoles(projectId: number, userId: number, roles: string[]) {
  const response = await fetch(`/api/projects/${projectId}/members`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "set_roles",
      userId,
      roles,
    }),
  })
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, "Erro ao atualizar papéis"))
  }

  return payload?.membership as ProjectMemberCreateOrUpdate
}

export async function setProjectLeader(projectId: number, userId: number | null) {
  const response = await fetch(`/api/projects/${projectId}/members`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "set_leader",
      userId,
    }),
  })
  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(buildErrorMessage(payload, "Erro ao definir líder"))
  }

  return payload?.leader as { projectId: number; leaderId: number | null }
}
