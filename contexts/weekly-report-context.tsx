"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { WeeklyReportsAPI } from "@/contexts/api-client"
import { useAuth } from "@/contexts/auth-context"
import type { WeeklyReport, WeeklyReportFormData } from "@/contexts/types"
import { hasAccess } from "@/lib/utils/utils"

interface WeeklyReportContextType {
  weeklyReports: WeeklyReport[]
  loading: boolean
  error: string | null
  fetchWeeklyReports: (userId?: number, weekStart?: string, weekEnd?: string) => Promise<void>
  generateWeeklyReport: (userId: number, weekStart: string, weekEnd: string) => Promise<WeeklyReport>
  createWeeklyReport: (report: WeeklyReportFormData) => Promise<WeeklyReport>
  updateWeeklyReport: (id: number, data: Partial<WeeklyReport>) => Promise<WeeklyReport>
  deleteWeeklyReport: (id: number) => Promise<void>
  fetchWeeklyReportById: (id: number) => Promise<WeeklyReport | null>
}

const WeeklyReportContext = createContext<WeeklyReportContextType | undefined>(undefined)

export function WeeklyReportProvider({ children }: { children: ReactNode }) {
  const [weeklyReports, setWeeklyReports] = useState<WeeklyReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  const userId = user?.id
  const userRoles = user?.roles

  const fetchWeeklyReports = useCallback(async (userId?: number, weekStart?: string, weekEnd?: string) => {
    try {
      setLoading(true)
      setError(null)
      const response = await WeeklyReportsAPI.getAll(userId, weekStart, weekEnd)
      const reports = response?.weeklyReports || []
      setWeeklyReports(reports)
    } catch (err) {
      console.error("Weekly report context - Error fetching reports:", err)
      setError("Erro ao carregar relatórios semanais")
      setWeeklyReports([])
    } finally {
      setLoading(false)
    }
  }, [])

  const generateWeeklyReport = async (userId: number, weekStart: string, weekEnd: string) => {
    try {
      setLoading(true)
      setError(null)
      const response = await WeeklyReportsAPI.generate(userId, weekStart, weekEnd)
      const report = response?.weeklyReport
      if (report) {
        await fetchWeeklyReports()
        return report
      }
      throw new Error("Erro ao gerar relatório semanal: resposta inválida")
    } catch (err) {
      setError("Erro ao gerar relatório semanal")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const createWeeklyReport = async (reportData: WeeklyReportFormData) => {
    try {
      setLoading(true)
      setError(null)
      const response = await WeeklyReportsAPI.create(reportData)
      const report = response?.weeklyReport
      if (report) {
        setWeeklyReports((prev) => [report, ...prev])
        return report
      }
      throw new Error("Erro ao criar relatório semanal: resposta inválida")
    } catch (err) {
      setError("Erro ao criar relatório semanal")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateWeeklyReport = async (id: number, reportData: Partial<WeeklyReport>) => {
    try {
      setLoading(true)
      setError(null)
      const response = await WeeklyReportsAPI.update(id, reportData)
      const report = response?.weeklyReport
      if (report) {
        setWeeklyReports((prev) => prev.map((r) => (r.id === id ? report : r)))
        return report
      }
      throw new Error("Erro ao atualizar relatório semanal: resposta inválida")
    } catch (err) {
      setError("Erro ao atualizar relatório semanal")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteWeeklyReport = async (id: number) => {
    try {
      setLoading(true)
      setError(null)
      await WeeklyReportsAPI.delete(id)
      setWeeklyReports((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      setError("Erro ao excluir relatório semanal")
      console.error(err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const fetchWeeklyReportById = async (id: number): Promise<WeeklyReport | null> => {
    try {
      setLoading(true)
      setError(null)
      const response = await WeeklyReportsAPI.getById(id)
      return response?.weeklyReport || null
    } catch (err) {
      setError("Erro ao buscar relatório semanal")
      console.error(err)
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (userId && userRoles && hasAccess(userRoles, 'VIEW_WEEKLY_REPORTS')) {
      fetchWeeklyReports()
    } else {
      setWeeklyReports([])
    }
  }, [userId, userRoles, fetchWeeklyReports])

  return (
    <WeeklyReportContext.Provider
      value={{
        weeklyReports,
        loading,
        error,
        fetchWeeklyReports,
        generateWeeklyReport,
        createWeeklyReport,
        updateWeeklyReport,
        deleteWeeklyReport,
        fetchWeeklyReportById,
      }}
    >
      {children}
    </WeeklyReportContext.Provider>
  )
}

export function useWeeklyReports() {
  const context = useContext(WeeklyReportContext)
  if (context === undefined) {
    throw new Error("useWeeklyReports deve ser usado dentro de um WeeklyReportProvider")
  }
  return context
} 