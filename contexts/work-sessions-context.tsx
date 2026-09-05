"use client"

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from "react"
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

interface WorkSessionsContextType {
  sessions: WorkSession[]
  activeSession: WorkSession | null
  pausedSession: WorkSession | null
  currentSession: WorkSession | null
  loading: boolean
  error: string | null
  fetchSessions: (userId?: number, status?: string) => Promise<void>
  startSession: (payload: StartSessionPayload) => Promise<WorkSession>
  endSession: (id: number, activity?: string, options?: { dailyLogNote?: string; dailyLogDate?: string }) => Promise<WorkSession>
  pauseSession: (id: number) => Promise<WorkSession>
  resumeSession: (id: number) => Promise<WorkSession>
  getElapsedSeconds: (session?: WorkSession | null) => number
  getWeeklyHours: (userId: number, weekStart: string, weekEnd: string) => Promise<number>
}

const WorkSessionsContext = createContext<WorkSessionsContextType | undefined>(undefined)

export function WorkSessionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id
  const [sessions, setSessions] = useState<WorkSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSessions = useCallback(async (targetUserId?: number, status?: string) => {
    const id = targetUserId ?? userId
    if (!id) return

    setLoading(true)
    setError(null)
    try {
      const response = await WorkSessionsAPI.getAll(id, status)
      setSessions(Array.isArray(response) ? response : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar sessões"
      setError(message)
      // Keep the last good sessions: a transient failure must not wipe the
      // list, which would reset the floating timer to 00:00:00 while the
      // session is still live. The next successful refresh restores the data.
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (userId) {
      fetchSessions(userId)
    } else {
      setSessions([])
    }
  }, [userId, fetchSessions])

  const activeSession = useMemo(() => {
    if (!userId) return null
    return sessions.find((session) => session?.status === "active" && session?.userId === userId) || null
  }, [sessions, userId])

  const pausedSession = useMemo(() => {
    if (!userId) return null
    return sessions.find((session) => session?.status === "paused" && session?.userId === userId) || null
  }, [sessions, userId])

  const currentSession = useMemo(() => {
    if (!userId) return null
    return (
      sessions.find(
        (session) =>
          session?.userId === userId &&
          (session?.status === "active" || session?.status === "paused"),
      ) || null
    )
  }, [sessions, userId])

  const getElapsedSeconds = useCallback((session?: WorkSession | null) => {
    if (!session) return 0

    const MAX_STRETCH_SEC = 9 * 3600
    const accumulated = typeof session.duration === "number" ? session.duration : 0
    if (session.status === "active" && session.startTime) {
      const start = new Date(session.startTime).getTime()
      const now = Date.now()
      const running = Math.min(MAX_STRETCH_SEC, Math.max(0, (now - start) / 1000))
      return Math.floor(accumulated + running)
    }

    return Math.floor(accumulated)
  }, [])

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

  const pauseSession = useCallback(async (id: number): Promise<WorkSession> => {
    if (!user) throw new Error("Usuário não autenticado")

    setLoading(true)
    setError(null)
    try {
      const response = await WorkSessionsAPI.update(id, {
        status: "paused",
      })
      const updatedSession = response?.data || response
      await fetchSessions(user.id)
      return updatedSession
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao pausar sessão"
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user, fetchSessions])

  const resumeSession = useCallback(async (id: number): Promise<WorkSession> => {
    if (!user) throw new Error("Usuário não autenticado")

    setLoading(true)
    setError(null)
    try {
      const response = await WorkSessionsAPI.update(id, {
        status: "active",
      })
      const updatedSession = response?.data || response
      await fetchSessions(user.id)
      return updatedSession
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao retomar sessão"
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [user, fetchSessions])

  const getWeeklyHours = useCallback(async (targetUserId: number, weekStart: string, weekEnd: string): Promise<number> => {
    const weekStartDate = new Date(weekStart)
    const weekEndDate = new Date(weekEnd)

    const completedSessions = sessions.filter((session) =>
      session &&
      session.userId === targetUserId &&
      session.status === "completed" &&
      session.startTime &&
      typeof session.duration === "number" &&
      new Date(session.startTime) >= weekStartDate &&
      new Date(session.startTime) <= weekEndDate
    )

    const totalSeconds = completedSessions.reduce((sum, session) => sum + (session.duration || 0), 0)
    return totalSeconds / 3600
  }, [sessions])

  return (
    <WorkSessionsContext.Provider
      value={{
        sessions,
        activeSession,
        pausedSession,
        currentSession,
        loading,
        error,
        fetchSessions,
        startSession,
        endSession,
        pauseSession,
        resumeSession,
        getElapsedSeconds,
        getWeeklyHours,
      }}
    >
      {children}
    </WorkSessionsContext.Provider>
  )
}

export function useWorkSessions() {
  const context = useContext(WorkSessionsContext)
  if (context === undefined) {
    throw new Error("useWorkSessions deve ser usado dentro de um WorkSessionsProvider")
  }
  return context
}
