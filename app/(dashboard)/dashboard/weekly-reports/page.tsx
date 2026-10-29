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
import { Calendar, FileText, CalendarDays, Plus, FolderKanban, UserRound, Award, ArrowRight } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertTriangle } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import type { WeeklyReport } from "@/contexts/types"
import { groupWeeklyReportsByMonth, monthHeadingLabel, weekHeadingLabel } from "@/lib/reports/weekly-report-groups"
import { WeeklyReportDetail } from "@/components/ui/weekly-report-detail"
import { ProjectReportsPanel } from "@/components/features/project-reports-panel"
import { PERIOD_LABELS } from "@/components/features/project-report-dialog"
import { REPORT_PERIOD_TYPES, listPeriods, type ReportPeriodType } from "@/lib/constants/report-periods"
import { PageHeader } from "@/components/ui/page-header"
import { ProjectTechnicalReportsPanel } from "@/components/features/project-technical-reports-panel"
import { ProjectCertificatesPanel } from "@/components/features/project-certificates-panel"
import { useSearchParams } from "next/navigation"

function reportProjectCount(report: WeeklyReport): number {
  const logs = Array.isArray(report.logs) ? report.logs : []
  return new Set(logs.map((log) => log.project?.id).filter((id): id is number => typeof id === "number")).size
}

export default function WeeklyReportsPage() {
  const searchParams = useSearchParams()
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
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "projetos" ? "projetos" : "usuarios")
  const [assistantType, setAssistantType] = useState(searchParams.get("tab") === "atestados" ? "atestados" : searchParams.get("tab") === "projetos" ? "projetos" : "usuarios")
  const [assistantProjectId, setAssistantProjectId] = useState(searchParams.get("projectId") ?? "")

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
  const selectedProject = projects.find((project) => String(project.id) === assistantProjectId)
  const canManageSelectedProject = Boolean(selectedProject && user && (
    selectedProject.leaderId === user.id ||
    hasAccess(user.roles || [], "MANAGE_USERS") ||
    hasAccess(user.roles || [], "MANAGE_PROJECTS") ||
    user.roles.some((role) => ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"].includes(role))
  ))

  function openAssistantFlow() {
    if (assistantType === "usuarios") {
      setActiveTab("usuarios")
      return
    }
    if (!assistantProjectId) {
      toast({ title: "Selecione um projeto", description: "Escolha o projeto antes de abrir este fluxo." })
      return
    }
    setActiveTab(assistantType === "atestados" ? "atestados" : "projetos")
  }

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

  // Dois níveis de agrupamento (pedido do dono): MÊS/ANO no topo e, dentro, a SEMANA
  // (intervalo de segunda a domingo) com a lista de relatórios — regra pura em
  // lib/reports/weekly-report-groups.ts, testada isolada do React.
  const reportsGroupedByMonth = useMemo(
    () => groupWeeklyReportsByMonth(weeklyReports),
    [weeklyReports],
  )

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
    <div className="container mx-auto space-y-6 p-4 md:p-6">
      <PageHeader
        title="Relatórios"
        description="Gere e consulte relatórios semanais, documentos técnicos e atestados."
        icon={FileText}
        actions={<Badge variant="secondary">{weeklyReports.length} por usuário</Badge>}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Assistente de geração</CardTitle>
          <CardDescription>Escolha o tipo, informe o projeto quando necessário e abra o gerador correspondente.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="report-assistant-type">1. Tipo de relatório</Label>
            <Select value={assistantType} onValueChange={setAssistantType}>
              <SelectTrigger id="report-assistant-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="usuarios">Por usuário (semanal)</SelectItem>
                <SelectItem value="projetos">Por projeto (técnico e periódico)</SelectItem>
                <SelectItem value="atestados">Atestado de frequência</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-assistant-project">2. Projeto</Label>
            <Select value={assistantProjectId} onValueChange={setAssistantProjectId}>
              <SelectTrigger id="report-assistant-project" disabled={assistantType === "usuarios"}>
                <SelectValue placeholder={assistantType === "usuarios" ? "Não necessário" : "Selecione um projeto"} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={openAssistantFlow} className="gap-2">
            3. Abrir gerador <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="usuarios" className="gap-2"><UserRound className="h-4 w-4" />Por usuário</TabsTrigger>
          <TabsTrigger value="projetos" className="gap-2"><FolderKanban className="h-4 w-4" />Por projeto</TabsTrigger>
          <TabsTrigger value="atestados" className="gap-2"><Award className="h-4 w-4" />Atestados</TabsTrigger>
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
          <div className="space-y-10">
            {reportsGroupedByMonth.map((month) => (
              <section key={month.key} className="space-y-4" aria-label={monthHeadingLabel(month.key)}>
                <h3 className="text-lg font-semibold text-foreground">{monthHeadingLabel(month.key)}</h3>
                {month.weeks.map((week) => (
                  <div key={week.key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Semana {weekHeadingLabel(week)}
                      </h4>
                      <Badge variant="secondary">{week.reports.length} relatório(s)</Badge>
                    </div>
                    <div className="overflow-hidden rounded-lg border bg-card">
                      {week.reports.map((report) => (
                        <div key={report.id} className="flex flex-col gap-3 border-b p-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
                          <div className="flex min-w-0 flex-1 items-start gap-3">
                            <div className="mt-0.5 rounded-md bg-primary/10 p-2 text-primary">
                              <FileText className="h-4 w-4" aria-hidden="true" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h5 className="truncate font-medium">{report.userName}</h5>
                                <span className="text-xs text-muted-foreground">gerado em {formatDate(report.createdAt)}</span>
                              </div>
                              <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                                {report.summary || "Sem resumo registrado."}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2 pl-11 sm:pl-0">
                            <Badge variant="outline">{report.totalLogs} sessões</Badge>
                            {reportProjectCount(report) > 0 && <Badge variant="secondary">{reportProjectCount(report)} projetos</Badge>}
                            <Button variant="ghost" size="sm" onClick={() => handleOpenReportDetail(report)} aria-label={`Abrir relatório de ${report.userName}`}>
                              <FileText className="mr-2 h-4 w-4" />Abrir
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </div>

        </TabsContent>

        <TabsContent value="projetos" className="space-y-6">
          {selectedProject ? (
            <>
              <ProjectTechnicalReportsPanel projectId={selectedProject.id} canManage={canManageSelectedProject} />
              <ProjectReportsPanel projectId={selectedProject.id} />
            </>
          ) : (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Escolha um projeto no assistente acima para consultar e gerar relatórios.</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="atestados" className="space-y-6">
          {selectedProject ? (
            <ProjectCertificatesPanel projectId={selectedProject.id} canManage={canManageSelectedProject} />
          ) : (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Escolha um projeto no assistente acima para consultar e gerar atestados.</CardContent></Card>
          )}
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
