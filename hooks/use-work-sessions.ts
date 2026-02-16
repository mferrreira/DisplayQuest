"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { WorkSessionsAPI } from "@/contexts/api-client"
import { useAuth } from "@/contexts/auth-context"
import type { WorkSession } from "@/contexts/types"

type StartSessionPayload = {
  userId: number
  userName?: string
  activity?: string
  location?: string
  projectId?: number
}

export function useWorkSessions() {
  const { user } = useAuth()
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async (userId?: number, status?: string) => {
    const targetUserId = userId ?? user?.id
    if (!targetUserId) return

    setLoading(true)
    setError(null)
    try {
      const response = await WorkSessionsAPI.getAll(targetUserId, status)
      setSessions(Array.isArray(response) ? response : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar sessões"
      setError(message)
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (user?.id) {
      fetchSessions(user.id)
    } else {
      setSessions([])
    }
  }, [user?.id, fetchSessions])

  const activeSession = useMemo(() => {
    if (!user?.id) return null
    return sessions.find((session) => session?.status === "active" && session?.userId === user.id) || null
  }, [sessions, user?.id])

  const startSession = useCallback(async (payload: StartSessionPayload): Promise<WorkSession> => {
    if (!user) throw new Error("Usuário não autenticado")
    setLoading(true)
    setError(null)
    try {
      const response = await WorkSessionsAPI.start({
        ...payload,
        userId: user.id,
        userName: user.name,
      })
      const createdSession = response?.data || response
      await fetchSessions(user.id)
      return createdSession
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao iniciar sessão"
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user, fetchSessions])

  const endSession = useCallback(
    async (
      id: number,
      activity?: string,
      options?: { dailyLogNote?: string; dailyLogDate?: string },
    ): Promise<WorkSession> => {
    if (!user) throw new Error("Usuário não autenticado")
    setLoading(true)
    setError(null)
    try {
      const response = await WorkSessionsAPI.update(id, {
        status: "completed",
        endTime: new Date().toISOString(),
        activity,
        dailyLogNote: options?.dailyLogNote,
        dailyLogDate: options?.dailyLogDate,
      })
      const updatedSession = response?.data || response
      await fetchSessions(user.id)
      return updatedSession
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao finalizar sessão"
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  },
  [user, fetchSessions])

  const getWeeklyHours = useCallback(async (userId: number, weekStart: string, weekEnd: string): Promise<number> => {
    const weekStartDate = new Date(weekStart)
    const weekEndDate = new Date(weekEnd)

    const completedSessions = sessions.filter((session) =>
      session &&
      session.userId === userId &&
      session.status === "completed" &&
      session.startTime &&
      typeof session.duration === "number" &&
      new Date(session.startTime) >= weekStartDate &&
      new Date(session.startTime) <= weekEndDate
    )

    const totalSeconds = completedSessions.reduce((sum, session) => sum + (session.duration || 0), 0)
    return totalSeconds / 3600
  }, [sessions])

  return {
    sessions,
    activeSession,
    loading,
    error,
    fetchSessions,
    startSession,
    endSession,
    getWeeklyHours,
  }
}
