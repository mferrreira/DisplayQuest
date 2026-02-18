"use client"

import { useCallback, useEffect, useState } from "react"
import { DailyLogsAPI } from "@/contexts/api-client"
import { useAuth } from "@/contexts/auth-context"
import type { DailyLog } from "@/contexts/types"

type CreateLogInput = {
  userId: number
  date: string
  note?: string
  projectId?: number
}

type UpdateLogInput = {
  note?: string
  date?: string
}

export function useDailyLogs() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async (userId?: number, date?: string) => {
    try {
      setLoading(true)
      setError(null)
      const response = await DailyLogsAPI.getAll(userId, date)
      setLogs(response.logs || [])
    } catch (_err) {
      setError("Erro ao carregar logs diários")
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAllLogs = useCallback(async (date?: string) => {
    try {
      setLoading(true)
      setError(null)
      const response = await DailyLogsAPI.getAll(undefined, date)
      setLogs(response.logs || [])
    } catch (_err) {
      setError("Erro ao carregar logs diários")
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchProjectLogs = useCallback(async (projectId: number, date?: string) => {
    try {
      setLoading(true)
      setError(null)
      const response = await DailyLogsAPI.getAll(undefined, date, projectId)
      setLogs(response.logs || [])
    } catch (_err) {
      setError("Erro ao carregar logs do projeto")
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user?.id) {
      fetchLogs(user.id)
    } else {
      setLogs([])
      setLoading(false)
    }
  }, [user?.id, fetchLogs])

  const createLog = async (log: CreateLogInput): Promise<DailyLog> => {
    void log
    const message = "Criação manual de log descontinuada. Finalize uma Work Session para gerar o registro diário."
    setError(message)
    throw new Error(message)
  }

  const updateLog = async (id: number, data: UpdateLogInput): Promise<DailyLog> => {
    void id
    void data
    const message = "Edição de log descontinuada. Ajuste a Work Session associada."
    setError(message)
    throw new Error(message)
  }

  const deleteLog = async (id: number): Promise<void> => {
    void id
    const message = "Remoção de log descontinuada. Ajuste a Work Session associada."
    setError(message)
    throw new Error(message)
  }

  return {
    logs,
    loading,
    error,
    fetchLogs,
    fetchAllLogs,
    fetchProjectLogs,
    createLog,
    updateLog,
    deleteLog,
  }
}
