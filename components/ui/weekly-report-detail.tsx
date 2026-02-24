"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Calendar, FileText, User, CalendarDays, X, Download, Clock, Loader2 } from "lucide-react"
import type { WeeklyReport, DailyLog } from "@/contexts/types"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/contexts/auth-context"
import { useWeeklyReports } from "@/contexts/weekly-report-context"

interface ProjectReportLog {
  id: number
  date: Date | string
  note?: string | null
  project?: {
    id: number
    name: string
  } | null
  userName?: string | null
  location?: string | null
  durationSeconds?: number | null
}

export interface ProjectWeeklyDetailReport {
  reportType: "project"
  id: string | number
  projectId: number
  projectName: string
  weekStart: Date | string
  weekEnd: Date | string
  totalLogs: number
  totalHours: number
  contributorCount: number
  summary?: string | null
  createdAt: Date | string
  logs: ProjectReportLog[]
}

type UserWeeklyDetailReport = WeeklyReport & { reportType?: "user" }
type WeeklyReportDetailModel = UserWeeklyDetailReport | ProjectWeeklyDetailReport

interface WeeklyReportDetailProps {
  report: WeeklyReportDetailModel
  onClose: () => void
  loading?: boolean
  onDelete?: (id: number) => void
}

export function WeeklyReportDetail({ report, onClose, loading, onDelete }: WeeklyReportDetailProps) {
  const { user } = useAuth()
  const { deleteWeeklyReport } = useWeeklyReports()
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isProjectReport = report.reportType === "project"

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('pt-BR')
  }

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  const getWeekRange = (start: Date | string, end: Date | string) => {
    return `${formatDate(start)} - ${formatDate(end)}`
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const logs = Array.isArray(report.logs) ? report.logs : []
      const header = isProjectReport
        ? `RELATÓRIO SEMANAL DO PROJETO - ${report.projectName}`
        : `RELATÓRIO SEMANAL - ${report.userName}`
      const totals = isProjectReport
        ? `Total de Sessões: ${report.totalLogs}\nTotal de Horas: ${report.totalHours.toFixed(1)}\nContribuidores: ${report.contributorCount}`
        : `Total de Logs: ${report.totalLogs}`

      const sessionsText = logs.length > 0
        ? `SESSÕES CONSOLIDADAS:\n${logs.map((log: any, index: number) => {
            const lines = [
              `${index + 1}. ${formatDate(log.date)} - ${formatTime(log.date)}`,
              isProjectReport && log.userName ? `   Usuário: ${log.userName}` : "",
              `   ${log.note || "Sem descrição"}`,
              log.project ? `   Projeto: ${log.project.name}` : "",
              isProjectReport && typeof log.durationSeconds === "number"
                ? `   Duração: ${(log.durationSeconds / 3600).toFixed(2)}h`
                : "",
              isProjectReport && log.location ? `   Local: ${log.location}` : "",
            ].filter(Boolean)

            return lines.join("\n")
          }).join("\n\n")}`
        : "Nenhum log encontrado para este período."

      const reportText = `
${header}
Período: ${getWeekRange(report.weekStart, report.weekEnd)}
${totals}
Data de Criação: ${formatDate(report.createdAt)}

${report.summary || "Nenhum resumo disponível"}

${sessionsText}
      `.trim()

      // Create and download file
      const blob = new Blob([reportText], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = isProjectReport
        ? `relatorio-projeto-${report.projectId}-${formatDate(report.weekStart)}.txt`
        : `relatorio-semanal-${report.userName}-${formatDate(report.weekStart)}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Erro ao exportar relatório:', error)
    } finally {
      setIsExporting(false)
    }
  }

  const canDelete = !isProjectReport && user && (user.roles?.includes("COORDENADOR") || user.id === report.userId)

  const handleDelete = async () => {
    if (!canDelete) return
    setIsDeleting(true)
    try {
      if (isProjectReport) return
      await deleteWeeklyReport(Number(report.id))
      if (onDelete) onDelete(Number(report.id))
      onClose()
    } catch (err) {
      // Optionally show error
    } finally {
      setIsDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
          <p className="text-lg text-gray-700 dark:text-gray-200">Carregando relatório...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
                <FileText className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold">Relatório Detalhado</h3>
                <p className="text-sm text-gray-500">
                  {isProjectReport
                    ? `Relatório semanal do projeto ${report.projectName}`
                    : `Relatório semanal de ${report.userName}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar
                  </>
                )}
              </Button>
             {canDelete && (
               <Button
                 variant="destructive"
                 size="sm"
                 onClick={handleDelete}
                 disabled={isDeleting}
               >
                 {isDeleting ? "Excluindo..." : "Excluir"}
               </Button>
             )}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="space-y-6">
            {/* Report Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Informações Gerais
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">
                      {isProjectReport ? "Projeto" : "Usuário"}
                    </Label>
                    <p className="text-lg font-medium">
                      {isProjectReport ? report.projectName : report.userName}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Período</Label>
                    <p className="text-lg font-medium">{getWeekRange(report.weekStart, report.weekEnd)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">
                      {isProjectReport ? "Total de Sessões" : "Total de Logs"}
                    </Label>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-medium">{report.totalLogs}</p>
                      <Badge variant="outline">{isProjectReport ? "sessões" : "logs"}</Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Data de Criação</Label>
                    <p className="text-lg font-medium">{formatDate(report.createdAt)}</p>
                  </div>
                </div>

                {isProjectReport && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Horas Totais</Label>
                      <p className="text-lg font-medium">{report.totalHours.toFixed(1)}h</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Contribuidores</Label>
                      <p className="text-lg font-medium">{report.contributorCount}</p>
                    </div>
                  </div>
                )}
                
                {report.summary && (
                  <div className="mt-4">
                    <Label className="text-sm font-medium text-gray-500">Resumo</Label>
                    <p className="text-gray-700 dark:text-gray-300 mt-1">{report.summary}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Daily Logs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Sessões Consolidadas ({report.totalLogs})
                </CardTitle>
                <CardDescription>
                  Registros derivados das sessões concluídas no período
                </CardDescription>
              </CardHeader>
              <CardContent>
                {report.logs && report.logs.length > 0 ? (
                  <div className="space-y-4">
                    {report.logs.map((log: any, index) => (
                      <div key={`${log.id}-${index}`} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {formatDate(log.date)}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              {formatTime(log.date)}
                            </span>
                          </div>
                          {log.project && (
                            <Badge variant="outline">
                              {log.project.name}
                            </Badge>
                          )}
                        </div>
                        {isProjectReport && log.userName && (
                          <p className="text-sm text-gray-500 mb-1">Usuário: {log.userName}</p>
                        )}
                        <p className="text-gray-700 dark:text-gray-300">
                          {log.note || "Sem descrição"}
                        </p>
                        {isProjectReport && (
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                            {typeof log.durationSeconds === "number" && (
                              <span>Duração: {(log.durationSeconds / 3600).toFixed(2)}h</span>
                            )}
                            {log.location && <span>Local: {log.location}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhum log encontrado para este período</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
} 
