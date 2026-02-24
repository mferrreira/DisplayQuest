"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { LabResponsibility } from "@/contexts/types"

// Define ActiveResponsibility type locally since it's not in types.ts
interface ActiveResponsibility {
  id: number
  userId: number
  userName: string
  startTime: string
  duration: number
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

  const toActiveResponsibility = useCallback((responsibility: any): ActiveResponsibility | null => {
    if (!responsibility) return null

    const startTimeMs = new Date(responsibility.startTime).getTime()
    const nowMs = Date.now()
    const durationSeconds = Number.isFinite(startTimeMs)
      ? Math.max(0, Math.floor((nowMs - startTimeMs) / 1000))
      : 0

    return {
      id: responsibility.id,
      userId: responsibility.userId,
      userName: responsibility.userName,
      startTime: responsibility.startTime,
      duration: durationSeconds,
      userRole: responsibility.userRole,
    }
  }, [])

  // Atualizar o tempo de duração da responsabilidade ativa a cada segundo
  useEffect(() => {
    if (!activeResponsibility) return

    const interval = setInterval(() => {
      setActiveResponsibility((prev) => {
        if (!prev) return null
        return {
          ...prev,
          duration: prev.duration + 1,
        }
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [activeResponsibility])

  const fetchResponsibilities = useCallback(async (startDate?: string, endDate?: string) => {
    try {
      setLoading(true)
      setError(null)

      const { responsibilities } = await ResponsibilitiesAPI.getAll(startDate, endDate)
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

  // Carregar dados quando o componente montar ou o usuário mudar
  useEffect(() => {
    if (user) {
      fetchResponsibilities()
      fetchActiveResponsibility()
    } else {
      setResponsibilities([])
      setActiveResponsibility(null)
    }
  }, [user, fetchResponsibilities, fetchActiveResponsibility])

  const startResponsibility = async (notes?: string) => {
    try {
      if (!user) throw new Error("Usuário não autenticado")

      setLoading(true)
      setError(null)

      const { responsibility } = await ResponsibilitiesAPI.start({
        userId: user.id,
        userName: user.name,
        notes,
      })

      // Atualizar a lista de responsabilidades
      setResponsibilities((prev) => [responsibility, ...prev])

      // Atualizar a responsabilidade ativa
      setActiveResponsibility(toActiveResponsibility(responsibility))
    } catch (err) {
      setError("Erro ao iniciar responsabilidade")
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

      const { responsibility } = await ResponsibilitiesAPI.end(activeResponsibility.id, user.id)

      // Atualizar a lista de responsabilidades
      setResponsibilities((prev) => prev.map((r) => (r.id === responsibility.id ? responsibility : r)))

      // Limpar a responsabilidade ativa
      setActiveResponsibility(null)
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

      const { responsibility } = await ResponsibilitiesAPI.updateNotes(id, notes)

      // Atualizar a lista de responsabilidades
      setResponsibilities((prev) => prev.map((r) => (r.id === responsibility.id ? responsibility : r)))
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
