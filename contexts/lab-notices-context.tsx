"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { LabNoticesAPI } from "@/contexts/api-client"

interface LabNotice {
  id: number
  userId: number
  userName: string
  note: string
  createdAt: string
}

interface LabNoticesContextType {
  notices: LabNotice[]
  loading: boolean
  error: string | null
  fetchNotices: () => Promise<void>
  createNotice: (payload: { note: string }) => Promise<LabNotice>
  deleteNotice: (noticeId: number) => Promise<void>
}

const LabNoticesContext = createContext<LabNoticesContextType | undefined>(undefined)

export function LabNoticesProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<LabNotice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchNotices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { notices } = await LabNoticesAPI.getAll()
      setNotices(notices)
    } catch (err) {
      setError("Erro ao carregar avisos do laboratório")
      setNotices([])
    } finally {
      setLoading(false)
    }
  }, [])

  const createNotice = useCallback(async (payload: { note: string }) => {
    setLoading(true)
    setError(null)
    try {
      const { notice } = await LabNoticesAPI.create(payload)
      // Refetch dos avisos (fonte de verdade)
      await fetchNotices()
      return notice
    } catch (err) {
      setError("Erro ao criar aviso do laboratório")
      throw err
    } finally {
      setLoading(false)
    }
  }, [fetchNotices])

  const deleteNotice = useCallback(async (noticeId: number) => {
    setLoading(true)
    setError(null)
    try {
      await LabNoticesAPI.delete(noticeId)
      // Refetch dos avisos (fonte de verdade)
      await fetchNotices()
    } catch (err) {
      setError("Erro ao remover aviso do laboratório")
      throw err
    } finally {
      setLoading(false)
    }
  }, [fetchNotices])

  return (
    <LabNoticesContext.Provider value={{ notices, loading, error, fetchNotices, createNotice, deleteNotice }}>
      {children}
    </LabNoticesContext.Provider>
  )
}

export function useLabNotices() {
  const context = useContext(LabNoticesContext)
  if (context === undefined) {
    throw new Error("useLabNotices deve ser usado dentro de um LabNoticesProvider")
  }
  return context
}
