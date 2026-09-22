"use client"

import { useState, useEffect, useMemo } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useWeeklyReports } from "@/contexts/weekly-report-context"
import { useUser } from "@/contexts/user-context"
import { useProject } from "@/contexts/project-context"
import { hasAccess } from "@/lib/utils/utils"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Calendar, FileText, CalendarDays, Plus, Download } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertTriangle } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import type { WeeklyReport } from "@/contexts/types"
import { WeeklyReportDetail } from "@/components/ui/weekly-report-detail"
import { ProjectReportsPanel } from "@/components/features/project-reports-panel"
import { PERIOD_LABELS } from "@/components/features/project-report-dialog"
import { REPORT_PERIOD_TYPES, listPeriods, type ReportPeriodType } from "@/lib/constants/report-periods"

export default function WeeklyReportsPage() {
  const { user } = useAuth()
  const { users } = useUser()
  const { projects } = useProject()
  const { weeklyReports, loading, error, fetchWeeklyReports, generateWeeklyReport, bulkGenerateWeeklyReports, fetchWeeklyReportById } = useWeeklyReports()
  const { toast } = useToast()
  
  const [selectedUser, setSelectedUser] = useState<string>("")
  const [weekStart, setWeekStart] = useState<string>("")
  const [weekEnd, setWeekEnd] = useState<string>("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [bulkPeriodType, setBulkPeriodType] = useState<string>("weekly")
  const [bulkFrom, setBulkFrom] = useState<string>("")
  const [bulkTo, setBulkTo] = useState<string>("")
  const [isBulkGenerating, setIsBulkGenerating] = useState(false)
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Set default week (Monday-Sunday, matching backend weekStartsOn: 1)
  useEffect(() => {
    const now = new Date()
    const dayOfWeek = now.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek

    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() + mondayOffset)
    startOfWeek.setHours(0, 0, 0, 0)

    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 6)
    endOfWeek.setHours(23, 59, 59, 999)

    setWeekStart(startOfWeek.toISOString().split('T')[0])
    setWeekEnd(endOfWeek.toISOString().split('T')[0])
    setBulkFrom(startOfWeek.toISOString().split('T')[0])
    setBulkTo(startOfWeek.toISOString().split('T')[0])
  }, [])

  const handleGenerateReport = async () => {
    if (!selectedUser || !weekStart || !weekEnd) {
      toast({
        title: "Erro",
        description: "Por favor, selecione um usuário e defina o período da semana.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsGenerating(true)
      await generateWeeklyReport(Number(selectedUser), weekStart, weekEnd)
      toast({
        title: "Sucesso",
        description: "Relatório semanal gerado com sucesso!",
      })
      await fetchWeeklyReports()
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao gerar relatório semanal.",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const activeUserCount = users.filter((user) => user.status === "active").length

  const bulkPreviewPeriods = useMemo(() => {
    if (!bulkFrom || !bulkTo) return []
    const from = new Date(bulkFrom)
    const to = new Date(bulkTo)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return []
    return listPeriods(bulkPeriodType as ReportPeriodType, from, to)
  }, [bulkPeriodType, bulkFrom, bulkTo])

  const handleBulkGenerate = async () => {
    if (!bulkPeriodType || !bulkFrom || !bulkTo) {
      toast({
        title: "Erro",
        description: "Defina a periodicidade e o intervalo de períodos.",
        variant: "destructive",
      })
      return
    }
    if (bulkPreviewPeriods.length === 0) {
      toast({
        title: "Erro",
        description: "Nenhum período encontrado no intervalo informado.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsBulkGenerating(true)
      const result = await bulkGenerateWeeklyReports(bulkPeriodType, bulkFrom, bulkTo)
      toast({
        title: "Sucesso",
        description: `${result.reportCount} relatórios gerados em ${result.periodCount} períodos.`,
      })
      await fetchWeeklyReports()
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao gerar relatórios em lote.",
        variant: "destructive",
      })
    } finally {
      setIsBulkGenerating(false)
    }
  }

  const reportsGroupedByPeriod = useMemo(() => {
    const groups: Array<{ key: string; reports: WeeklyReport[] }> = []
    for (const report of weeklyReports) {
      const key = new Date(report.weekStart).toISOString().slice(0, 10)
      const group = groups.find((g) => g.key === key)
      if (group) {
        group.reports.push(report)
      } else {
        groups.push({ key, reports: [report] })
      }
    }
    groups.sort((a, b) => b.key.localeCompare(a.key))
    return groups
  }, [weeklyReports])

  const handleOpenReportDetail = async (report: WeeklyReport) => {
    setDetailLoading(true)
    try {
      const fullReport = await fetchWeeklyReportById(report.id)
      setSelectedReport(fullReport || report)
    } finally {
      setDetailLoading(false)
    }
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('pt-BR')
  }

  const getWeekRange = (start: Date | string, end: Date | string) => {
    return `${formatDate(start)} - ${formatDate(end)}`
  }

  if (!user || !hasAccess(user.roles || [], 'VIEW_WEEKLY_REPORTS')) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Você não tem permissão para acessar esta página.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Relatórios Semanais</h1>
          <p className="text-muted-foreground mt-2">
            Visualize e gere relatórios semanais baseados nas sessões de trabalho concluídas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          <Badge variant="secondary">{weeklyReports.length} relatórios</Badge>
        </div>
      </div>

      <Tabs defaultValue="usuarios" className="space-y-6">
        <TabsList>
          <TabsTrigger value="usuarios">Usuários (semanal)</TabsTrigger>
          <TabsTrigger value="projetos">Relatórios de Projeto</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {hasAccess(user.roles || [], 'MANAGE_USERS') && (
      // Bulk Generate Section
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Gerar Relatórios em Lote
          </CardTitle>
          <CardDescription>
            Gera relatórios de todos os usuários ativos para cada período do intervalo informado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bulkPeriodType">Periodicidade</Label>
              <Select value={bulkPeriodType} onValueChange={setBulkPeriodType}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a periodicidade" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_PERIOD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PERIOD_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulkFrom">De</Label>
              <Input
                id="bulkFrom"
                type="date"
                value={bulkFrom}
                onChange={(e) => setBulkFrom(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulkTo">Até</Label>
              <Input
                id="bulkTo"
                type="date"
                value={bulkTo}
                onChange={(e) => setBulkTo(e.target.value)}
              />
            </div>
          </div>

          {bulkFrom && bulkTo && (
            <p className="text-sm text-muted-foreground">
              {bulkPreviewPeriods.length > 0
                ? `${bulkPreviewPeriods.length} período(s) para ${activeUserCount} usuário(s) ativo(s) — ${bulkPreviewPeriods.length * activeUserCount} relatório(s) no total.`
                : "Nenhum período encontrado no intervalo informado."}
            </p>
          )}

          <div className="flex flex-col gap-2 md:flex-row">
            <Button
              onClick={handleBulkGenerate}
              disabled={isBulkGenerating || !bulkFrom || !bulkTo || bulkPreviewPeriods.length === 0}
              className="w-full md:w-auto"
            >
              {isBulkGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando em lote...
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Gerar em Lote
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Generate Report Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Gerar Novo Relatório
          </CardTitle>
          <CardDescription>
            Gere relatório por usuário no período informado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user">Usuário</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.name} ({user.roles.join(', ')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="weekStart">Início da Semana</Label>
              <Input
                id="weekStart"
                type="date"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="weekEnd">Fim da Semana</Label>
              <Input
                id="weekEnd"
                type="date"
                value={weekEnd}
                onChange={(e) => setWeekEnd(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex flex-col gap-2 md:flex-row">
            <Button 
              onClick={handleGenerateReport} 
              disabled={isGenerating || !selectedUser || !weekStart || !weekEnd}
              className="w-full md:w-auto"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Calendar className="mr-2 h-4 w-4" />
                  Gerar Relatório por Usuário
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reports List */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-foreground dark:text-white">Relatórios Existentes</h2>
        
        {weeklyReports.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center h-32">
              <div className="text-center text-gray-500 dark:text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum relatório semanal encontrado</p>
                <p className="text-sm">Gere um relatório para começar</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {reportsGroupedByPeriod.map((group, index) => (
              <div key={group.key} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground">
                    {group.reports.length > 0 ? getWeekRange(group.reports[0].weekStart, group.reports[0].weekEnd) : group.key}
                  </h3>
                  <Badge variant="secondary">{group.reports.length} relatório(s)</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.reports.map((report) => (
                    <Card 
                      key={report.id} 
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleOpenReportDetail(report)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{report.userName}</CardTitle>
                          <Badge variant="outline">
                            {report.totalLogs} sessões
                          </Badge>
                        </div>
                        <CardDescription className="flex items-center gap-1">
                          <CalendarDays className="h-4 w-4" />
                          {getWeekRange(report.weekStart, report.weekEnd)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-600 dark:text-muted-foreground dark:text-gray-400 dark:text-muted-foreground/70 line-clamp-2">
                          {report.summary || "Nenhum resumo disponível"}
                        </p>
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-gray-500 dark:text-muted-foreground">
                            {formatDate(report.createdAt)}
                          </span>
                          <Button variant="ghost" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {index < reportsGroupedByPeriod.length - 1 && (
                  <div className="h-px bg-border" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

        </TabsContent>

        <TabsContent value="projetos" className="space-y-6">
          <ProjectReportsPanel projects={projects.map((project) => ({ id: project.id, name: project.name }))} />
        </TabsContent>
      </Tabs>

      {/* WeeklyReportDetail Dialog */}
      {selectedReport && (
        <WeeklyReportDetail 
          report={selectedReport} 
          onClose={() => setSelectedReport(null)} 
          loading={detailLoading}
          onDelete={async () => {
            await fetchWeeklyReports()
            setSelectedReport(null)
          }}
        />
      )}
    </div>
  )
} 
