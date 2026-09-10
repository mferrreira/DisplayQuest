"use client"

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react"
import type { LabResponsibility } from "@/contexts/types"

// Define ActiveResponsibility type locally since it's not in types.ts
interface ActiveResponsibility {
  id: number
  userId: number
  userName: string
  startTime: string
  duration: number
  isPaused: boolean
  pausedAt?: string | null
  totalPausedMs?: number
  userRole?: string
}
import { ResponsibilitiesAPI } from "@/contexts/api-client"
import { useAuth } from "@/contexts/auth-context"

interface ResponsibilityContextType {
  responsibilities: LabResponsibility[]
  activeResponsibility: ActiveResponsibility | null
  loading: boolean
  error: string | null
  fetchResponsibilities: (startDate?: string, endDate?: string) => Promise<void>
  fetchActiveResponsibility: () => Promise<void>
  startResponsibility: (notes?: string) => Promise<void>
  pauseResponsibility: () => Promise<void>
  resumeResponsibility: () => Promise<void>
  endResponsibility: () => Promise<void>
  updateNotes: (id: number, notes: string) => Promise<void>
  deleteResponsibility: (id: number) => Promise<void>
}

const ResponsibilityContext = createContext<ResponsibilityContextType | undefined>(undefined)

export function ResponsibilityProvider({ children }: { children: ReactNode }) {
  const [responsibilities, setResponsibilities] = useState<LabResponsibility[]>([])
  const [activeResponsibility, setActiveResponsibility] = useState<ActiveResponsibility | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  const userId = user?.id
  // Último intervalo de mês buscado; mutações refazem o fetch desse período
  const lastRangeRef = useRef<{ start?: string; end?: string }>({})
  // History is lazy: only fetched via explicit fetchResponsibilities() calls
  // (the laboratorio page opts in on mount). Mutations must not pull the
  // full list into pages that only care about the active responsibility.
  const historyLoadedRef = useRef(false)

  const toActiveResponsibility = useCallback((responsibility: any): ActiveResponsibility | null => {
    if (!responsibility) return null

    // Backend-owned time: duration already arrives in seconds, computed
    // server-side from startTime/pausedAt/totalPausedMs (full precision, no
    // minute flooring). Use it directly so refresh/poll restores the timer.
    const serverDuration = typeof responsibility.duration === "number" ? responsibility.duration : 0 // seconds
    const isPaused = Boolean(responsibility.pausedAt)
    return {
      id: responsibility.id,
      userId: responsibility.userId,
      userName: responsibility.userName,
      startTime: responsibility.startTime,
      duration: Math.max(0, Math.floor(serverDuration)),
      isPaused,
      pausedAt: responsibility.pausedAt ?? null,
      totalPausedMs: responsibility.totalPausedMs ?? 0,
      userRole: responsibility.userRole,
    }
  }, [])

  // Display tick: advance the backend-anchored duration once per second.
  // Deps are the responsibility identity/pause flag (not the whole object):
  // the callback uses a functional update, so the interval must NOT be torn
  // down and recreated on every tick.
  useEffect(() => {
    if (!activeResponsibility) return

    const interval = setInterval(() => {
      setActiveResponsibility((prev) => {
        if (!prev || prev.isPaused) return prev
        return {
          ...prev,
          duration: prev.duration + 1,
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [activeResponsibility?.id, activeResponsibility?.isPaused])

  const fetchResponsibilities = useCallback(async (startDate?: string, endDate?: string) => {
    try {
      setLoading(true)
      setError(null)

      const { responsibilities } = await ResponsibilitiesAPI.getAll(startDate, endDate)
      lastRangeRef.current = { start: startDate, end: endDate }
      historyLoadedRef.current = true
      setResponsibilities(responsibilities)
    } catch (err) {
      setError("Erro ao carregar responsabilidades")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchActiveResponsibility = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { activeResponsibility } = await ResponsibilitiesAPI.getActive()
      setActiveResponsibility(toActiveResponsibility(activeResponsibility))
    } catch (err) {
      setError("Erro ao carregar responsabilidade ativa")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [toActiveResponsibility])

  // Carregar dados quando o componente montar ou o usuário mudar.
  // A responsabilidade ativa é global (o timer flutuante usa). O histórico é
  // preguiçoso: só carrega via chamada explícita (laboratorio) ou já carregado.
  useEffect(() => {
    if (userId) {
      void fetchActiveResponsibility()
    } else {
      setResponsibilities([])
      setActiveResponsibility(null)
      historyLoadedRef.current = false
    }
  }, [userId, fetchActiveResponsibility])

  const startResponsibility = async (notes?: string) => {
    try {
      if (!user) throw new Error("Usuário não autenticado")

      setLoading(true)
      setError(null)

      await ResponsibilitiesAPI.start({
        userId: user.id,
        userName: user.name,
        notes,
      })

      // Refetch do período atual + responsabilidade ativa (fonte de verdade).
      // Fora do laboratorio o histórico é preguiçoso: não puxar a lista cheia.
      const refresh: Promise<unknown>[] = [fetchActiveResponsibility()]
      if (historyLoadedRef.current) {
        refresh.push(fetchResponsibilities(lastRangeRef.current.start, lastRangeRef.current.end))
      }
      await Promise.all(refresh)
    } catch (err) {
      setError("Erro ao iniciar responsabilidade")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const pauseResponsibility = async () => {
    try {
      if (!activeResponsibility) throw new Error("Não há responsabilidade ativa")

      setLoading(true)
      setError(null)

      // Independent from the work session: pauses only the responsibility.
      // Reuses the existing backend pause (timestamps stay server-owned).
      await ResponsibilitiesAPI.pause()
      await fetchActiveResponsibility()
    } catch (err) {
      setError("Erro ao pausar responsabilidade")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const resumeResponsibility = async () => {
    try {
      if (!activeResponsibility) throw new Error("Não há responsabilidade ativa")

      setLoading(true)
      setError(null)

      await ResponsibilitiesAPI.resume()
      await fetchActiveResponsibility()
    } catch (err) {
      setError("Erro ao retomar responsabilidade")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const endResponsibility = async () => {
    try {
      if (!activeResponsibility) throw new Error("Não há responsabilidade ativa")
      if (!user) throw new Error("Usuário não autenticado")

      setLoading(true)
      setError(null)

      await ResponsibilitiesAPI.end(activeResponsibility.id, user.id)

      // Refetch do período atual + responsabilidade ativa (fonte de verdade).
      // Fora do laboratorio o histórico é preguiçoso: não puxar a lista cheia.
      const refreshEnd: Promise<unknown>[] = [fetchActiveResponsibility()]
      if (historyLoadedRef.current) {
        refreshEnd.push(fetchResponsibilities(lastRangeRef.current.start, lastRangeRef.current.end))
      }
      await Promise.all(refreshEnd)
    } catch (err) {
      setError("Erro ao encerrar responsabilidade")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateNotes = async (id: number, notes: string) => {
    try {
      setLoading(true)
      setError(null)

      await ResponsibilitiesAPI.updateNotes(id, notes)

      // Refetch do período atual para refletir as notas persistidas
      await fetchResponsibilities(lastRangeRef.current.start, lastRangeRef.current.end)
    } catch (err) {
      setError("Erro ao atualizar notas")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteResponsibility = async (id: number) => {
    try {
      setLoading(true)
      setError(null)

      await ResponsibilitiesAPI.delete(id)

      // Atualizar a lista de responsabilidades
      setResponsibilities((prev) => prev.filter((r) => r.id !== id))

      // Se a responsabilidade ativa foi excluída, limpar
      if (activeResponsibility && activeResponsibility.id === id) {
        setActiveResponsibility(null)
      }
    } catch (err) {
      setError("Erro ao excluir responsabilidade")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return (
    <ResponsibilityContext.Provider
      value={{
        responsibilities,
        activeResponsibility,
        loading,
        error,
        fetchResponsibilities,
        fetchActiveResponsibility,
        startResponsibility,
        pauseResponsibility,
        resumeResponsibility,
        endResponsibility,
        updateNotes,
        deleteResponsibility,
      }}
    >
      {children}
    </ResponsibilityContext.Provider>
  )
}

export function useResponsibility() {
  const context = useContext(ResponsibilityContext)
  if (context === undefined) {
    throw new Error("useResponsibility deve ser usado dentro de um ResponsibilityProvider")
  }
  return context
}
