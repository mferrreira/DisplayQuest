"use client"

import { useState, useEffect } from "react"
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
import { Calendar, FileText, Users, CalendarDays, Plus, Download } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertTriangle } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import type { WeeklyReport } from "@/contexts/types"
import { WeeklyReportDetail } from "@/components/ui/weekly-report-detail"

export default function WeeklyReportsPage() {
  const { user } = useAuth()
  const { users } = useUser()
  const { projects } = useProject()
  const { weeklyReports, loading, error, fetchWeeklyReports, generateWeeklyReport, fetchWeeklyReportById } = useWeeklyReports()
  const { toast } = useToast()
  
  const [selectedUser, setSelectedUser] = useState<string>("")
  const [selectedProject, setSelectedProject] = useState<string>("")
  const [weekStart, setWeekStart] = useState<string>("")
  const [weekEnd, setWeekEnd] = useState<string>("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGeneratingProjectReport, setIsGeneratingProjectReport] = useState(false)
  const [projectReport, setProjectReport] = useState<any | null>(null)
  const [projectReports, setProjectReports] = useState<any[]>([])
  const [selectedReport, setSelectedReport] = useState<WeeklyReport | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Set default week (current week)
  useEffect(() => {
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay()) // Sunday
    startOfWeek.setHours(0, 0, 0, 0)
    
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + (6 - now.getDay())) // Saturday
    endOfWeek.setHours(23, 59, 59, 999)
    
    setWeekStart(startOfWeek.toISOString().split('T')[0])
    setWeekEnd(endOfWeek.toISOString().split('T')[0])
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

  const handleOpenReportDetail = async (report: WeeklyReport) => {
    setDetailLoading(true)
    try {
      const fullReport = await fetchWeeklyReportById(report.id)
      setSelectedReport(fullReport || report)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleGenerateProjectReport = async () => {
    if (!selectedProject || !weekStart || !weekEnd) {
      toast({
        title: "Erro",
        description: "Selecione um projeto e defina o período da semana.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsGeneratingProjectReport(true)
      const response = await fetch(`/api/projects/${selectedProject}/hours?weekStart=${encodeURIComponent(weekStart)}&weekEnd=${encodeURIComponent(weekEnd)}`)
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload?.error || "Erro ao gerar relatório por projeto")
      }

      setProjectReport(payload?.hours || null)
      const projectInfo = projects.find((project) => project.id === Number(selectedProject))
      setProjectReports((prev) => [
        {
          id: `${selectedProject}-${weekStart}-${weekEnd}-${Date.now()}`,
          projectId: Number(selectedProject),
          projectName: projectInfo?.name || `Projeto ${selectedProject}`,
          weekStart,
          weekEnd,
          createdAt: new Date().toISOString(),
          data: payload?.hours || null,
        },
        ...prev,
      ])
      toast({
        title: "Sucesso",
        description: "Relatório por projeto gerado com sucesso!",
      })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao gerar relatório por projeto.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingProjectReport(false)
    }
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('pt-BR')
  }

  const getWeekRange = (start: Date | string, end: Date | string) => {
    return `${formatDate(start)} - ${formatDate(end)}`
  }

  const downloadProjectReport = (report: any) => {
    const filename = `relatorio-projeto-${report.projectId}-${report.weekStart}-${report.weekEnd}.json`
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.URL.revokeObjectURL(url)
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

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Generate Report Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Gerar Novo Relatório
          </CardTitle>
          <CardDescription>
            Gere relatório por usuário ou por projeto no período informado
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <Label htmlFor="project">Projeto</Label>
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
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

            <Button
              variant="outline"
              onClick={handleGenerateProjectReport}
              disabled={isGeneratingProjectReport || !selectedProject || !weekStart || !weekEnd}
              className="w-full md:w-auto"
            >
              {isGeneratingProjectReport ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Users className="mr-2 h-4 w-4" />
                  Gerar Relatório por Projeto
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {projectReport && (
        <Card>
          <CardHeader>
            <CardTitle>Relatório de Projeto</CardTitle>
            <CardDescription>
              {projects.find((project) => project.id === Number(selectedProject))?.name || "Projeto"} | {getWeekRange(weekStart, weekEnd)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm">Horas totais: <strong>{Number(projectReport.totalHours || 0).toFixed(1)}h</strong></div>
            <div className="text-sm">Sessões concluídas: <strong>{projectReport.sessionCount || 0}</strong></div>
            <div className="text-sm">Contribuidores: <strong>{Array.isArray(projectReport.hoursByUser) ? projectReport.hoursByUser.length : 0}</strong></div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Relatórios por Projeto</h2>
        {projectReports.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center h-24">
              <p className="text-sm text-muted-foreground">Nenhum relatório por projeto gerado ainda.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projectReports.map((report) => (
              <Card key={report.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{report.projectName}</CardTitle>
                    <Badge variant="outline">
                      {Number(report?.data?.totalHours || 0).toFixed(1)}h
                    </Badge>
                  </div>
                  <CardDescription className="flex items-center gap-1">
                    <CalendarDays className="h-4 w-4" />
                    {getWeekRange(report.weekStart, report.weekEnd)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Sessões: <strong>{report?.data?.sessionCount || 0}</strong> | Contribuidores: <strong>{Array.isArray(report?.data?.hoursByUser) ? report.data.hoursByUser.length : 0}</strong>
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-500">
                      {formatDate(report.createdAt)}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => downloadProjectReport(report)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Reports List */}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Relatórios Existentes</h2>
        
        {weeklyReports.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center h-32">
              <div className="text-center text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum relatório semanal encontrado</p>
                <p className="text-sm">Gere um relatório para começar</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {weeklyReports.map((report) => (
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
                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {report.summary || "Nenhum resumo disponível"}
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-gray-500">
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
        )}
      </div>

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
