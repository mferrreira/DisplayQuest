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

interface WeeklyReportDetailProps {
  report: WeeklyReport
  onClose: () => void
  loading?: boolean
  onDelete?: (id: number) => void
}

export function WeeklyReportDetail({ report, onClose, loading, onDelete }: WeeklyReportDetailProps) {
  const { user } = useAuth()
  const { deleteWeeklyReport } = useWeeklyReports()
  const [isExporting, setIsExporting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

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
      // Create a simple text report
      const reportText = `
RELATÓRIO SEMANAL - ${report.userName}
Período: ${getWeekRange(report.weekStart, report.weekEnd)}
Total de Logs: ${report.totalLogs}
Data de Criação: ${formatDate(report.createdAt)}

${report.summary || "Nenhum resumo disponível"}

${report.logs && report.logs.length > 0 ? `
SESSÕES CONSOLIDADAS:
${report.logs.map((log, index) => `
${index + 1}. ${formatDate(log.date)} - ${formatTime(log.date)}
   ${log.note || "Sem descrição"}
   ${log.project ? `Projeto: ${log.project.name}` : ""}
`).join('\n')}
` : "Nenhum log encontrado para este período."}
      `.trim()

      // Create and download file
      const blob = new Blob([reportText], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `relatorio-semanal-${report.userName}-${formatDate(report.weekStart)}.txt`
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

  const canDelete = user && (user.roles?.includes("COORDENADOR") || user.id === report.userId)

  const handleDelete = async () => {
    if (!canDelete) return
    setIsDeleting(true)
    try {
      await deleteWeeklyReport(report.id)
      if (onDelete) onDelete(report.id)
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
                <p className="text-sm text-gray-500">Relatório semanal de {report.userName}</p>
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
                    <Label className="text-sm font-medium text-gray-500">Usuário</Label>
                    <p className="text-lg font-medium">{report.userName}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Período</Label>
                    <p className="text-lg font-medium">{getWeekRange(report.weekStart, report.weekEnd)}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Total de Logs</Label>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-medium">{report.totalLogs}</p>
                      <Badge variant="outline">logs</Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Data de Criação</Label>
                    <p className="text-lg font-medium">{formatDate(report.createdAt)}</p>
                  </div>
                </div>
                
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
                    {report.logs.map((log, index) => (
                      <div key={log.id} className="border rounded-lg p-4">
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
                        <p className="text-gray-700 dark:text-gray-300">
                          {log.note || "Sem descrição"}
                        </p>
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
