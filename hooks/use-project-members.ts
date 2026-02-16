import { useCallback, useEffect, useState } from "react"
import {
  addProjectMember,
  listProjectMembers,
  removeProjectMember,
  setProjectLeader,
  setProjectMemberRoles,
  type ProjectMember,
} from "@/lib/api/project-members"

interface AvailableUser {
  id: number
  name: string
  email: string
  status?: string
  roles?: string[]
}

interface UseProjectMembersOptions {
  enabled?: boolean
  includeAvailableUsers?: boolean
}

export function useProjectMembers(projectId: number, options: UseProjectMembersOptions = {}) {
  const enabled = options.enabled ?? true
  const includeAvailableUsers = options.includeAvailableUsers ?? false

  const [members, setMembers] = useState<ProjectMember[]>([])
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAvailableUsers = useCallback(async (memberIds: number[]) => {
    if (!includeAvailableUsers) return

    try {
      const response = await fetch("/api/users")
      const payload = await response.json()
      if (!response.ok) return

      const users = Array.isArray(payload?.users) ? payload.users : []
      const available = users.filter(
        (user: AvailableUser) => !memberIds.includes(user.id) && user.status === "active",
      )
      setAvailableUsers(available)
    } catch {
      setAvailableUsers([])
    }
  }, [includeAvailableUsers])

  const reload = useCallback(async () => {
    if (!enabled || !Number.isInteger(projectId) || projectId <= 0) return

    setLoading(true)
    setError(null)
    try {
      const loadedMembers = await listProjectMembers(projectId)
      setMembers(loadedMembers)
      await fetchAvailableUsers(loadedMembers.map((member) => member.userId))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar membros do projeto")
    } finally {
      setLoading(false)
    }
  }, [enabled, projectId, fetchAvailableUsers])

  useEffect(() => {
    void reload()
  }, [reload])

  const addMember = useCallback(async (userId: number, roles: string[]) => {
    const result = await addProjectMember(projectId, userId, roles)
    await reload()
    return result
  }, [projectId, reload])

  const removeMember = useCallback(async (membershipId: number) => {
    const result = await removeProjectMember(projectId, membershipId)
    await reload()
    return result
  }, [projectId, reload])

  const updateMemberRoles = useCallback(async (userId: number, roles: string[]) => {
    const result = await setProjectMemberRoles(projectId, userId, roles)
    await reload()
    return result
  }, [projectId, reload])

  const updateLeader = useCallback(async (userId: number | null) => {
    const result = await setProjectLeader(projectId, userId)
    await reload()
    return result
  }, [projectId, reload])

  return {
    members,
    availableUsers,
    loading,
    error,
    setError,
    reload,
    addMember,
    removeMember,
    updateMemberRoles,
    updateLeader,
  }
}
