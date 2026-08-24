"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { 
  Clock, 
  TrendingUp, 
  Users, 
  Calendar,
  Download,
  Filter,
  Search,
  BarChart3,
  Target,
  Award,
  AlertCircle,
  CheckCircle2
} from "lucide-react"
import { useToast } from "@/contexts/use-toast"

interface AdminHoursManagementProps {
  users: any[]
  projects: any[]
  sessions: any[]
}

interface HoursReport {
  userId: number
  userName: string
  totalHours: number
  currentWeekHours: number
  projectHours: Record<number, number>
  sessionsCount: number
  averageSessionDuration: number
}

export function AdminHoursManagement({ users, projects, sessions }: AdminHoursManagementProps) {
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [filterUser, setFilterUser] = useState("all")
  const [filterProject, setFilterProject] = useState("all")
  const [filterPeriod, setFilterPeriod] = useState("week")
  const [hoursReports, setHoursReports] = useState<HoursReport[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    generateHoursReports()
  }, [users, sessions, filterPeriod])

  // Adicionar log para debug
  useEffect(() => {
    console.log('AdminHoursManagement: Sessões atualizadas', sessions.length)
  }, [sessions])

  const generateHoursReports = () => {
    setLoading(true)
    
    console.log('AdminHoursManagement: Gerando relatórios...')
    console.log('Sessões recebidas:', sessions.length)
    console.log('Filtro de período:', filterPeriod)
    
    const reports: HoursReport[] = users.map(user => {
      const userSessions = sessions.filter(session => 
        session.userId === user.id && session.status === 'completed'
      )

      // Filtrar por período
      const now = new Date()
      let startDate: Date
      
      switch (filterPeriod) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        case 'quarter':
          const quarter = Math.floor(now.getMonth() / 3)
          startDate = new Date(now.getFullYear(), quarter * 3, 1)
          break
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1)
          break
        default:
          startDate = new Date(0) // Todas as sessões
      }

      const filteredSessions = userSessions.filter(session => 
        new Date(session.startTime) >= startDate
      )

      const totalHours = filteredSessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 3600
      
      if (user.name === 'Coordenador') {
        console.log(`Coordenador - Sessões filtradas: ${filteredSessions.length}, Total horas: ${totalHours.toFixed(2)}h`)
        filteredSessions.forEach(session => {
          const hours = (session.duration || 0) / 3600
          console.log(`  - ${session.startTime}: ${hours.toFixed(2)}h`)
        })
      }

      // Horas da semana atual
      const weekStart = new Date(now)
      weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      weekStart.setHours(0, 0, 0, 0)
      
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)

      const currentWeekSessions = userSessions.filter(session => {
        const sessionDate = new Date(session.startTime)
        return sessionDate >= weekStart && sessionDate <= weekEnd
      })

      const currentWeekHours = currentWeekSessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 3600

      // Horas por projeto
      const projectHours: Record<number, number> = {}
      projects.forEach(project => {
        const projectSessions = filteredSessions.filter(session => session.projectId === project.id)
        const hours = projectSessions.reduce((sum, session) => sum + (session.duration || 0), 0) / 3600
        if (hours > 0) {
          projectHours[project.id] = hours
        }
      })

      const averageSessionDuration = filteredSessions.length > 0 
        ? (totalHours / filteredSessions.length) 
        : 0

      return {
        userId: user.id,
        userName: user.name,
        totalHours: Math.round(totalHours * 100) / 100,
        currentWeekHours: Math.round(currentWeekHours * 100) / 100,
        projectHours,
        sessionsCount: filteredSessions.length,
        averageSessionDuration: Math.round(averageSessionDuration * 100) / 100
      }
    })

    setHoursReports(reports)
    setLoading(false)
  }

  const exportReport = () => {
    const csvContent = [
      ['Usuário', 'Horas Totais', 'Horas Esta Semana', 'Sessões', 'Duração Média'],
      ...hoursReports.map(report => [
        report.userName,
        report.totalHours.toString(),
        report.currentWeekHours.toString(),
        report.sessionsCount.toString(),
        report.averageSessionDuration.toString()
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-horas-${filterPeriod}-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)

    toast({
      title: "Sucesso",
      description: "Relatório exportado com sucesso!",
    })
  }

  const getTotalHours = () => {
    return hoursReports.reduce((sum, report) => sum + report.totalHours, 0)
  }

  const getTotalSessions = () => {
    return hoursReports.reduce((sum, report) => sum + report.sessionsCount, 0)
  }

  const getAverageHours = () => {
    const activeUsers = hoursReports.filter(r => r.totalHours > 0).length
    return activeUsers > 0 ? Math.round((getTotalHours() / activeUsers) * 100) / 100 : 0
  }

  const filteredReports = hoursReports.filter(report => {
    const matchesSearch = report.userName.toLowerCase().includes(searchTerm.toLowerCase())
    
    let matchesUser = true
    if (filterUser !== "all") {
      const user = users.find(u => u.id === report.userId)
      matchesUser = user?.roles?.includes(filterUser) || false
    }

    let matchesProject = true
    if (filterProject !== "all") {
      matchesProject = Object.keys(report.projectHours).includes(filterProject)
    }

    return matchesSearch && matchesUser && matchesProject
  })

  const formatHours = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}min`
    }
    return `${Math.round(hours * 10) / 10}h`
  }

  return (
    <div className="space-y-6">
      {/* Header com filtros e ações */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Gestão de Horas Trabalhadas
          </CardTitle>
          <CardDescription>
            Relatórios detalhados e análise de produtividade
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-muted-foreground/70 h-4 w-4" />
                <Input
                  placeholder="Buscar usuários..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por função" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as funções</SelectItem>
                <SelectItem value="COORDENADOR">Coordenador</SelectItem>
                <SelectItem value="GERENTE">Gerente</SelectItem>
                <SelectItem value="LABORATORISTA">Laboratorista</SelectItem>
                <SelectItem value="GERENTE_PROJETO">Gerente de Projeto</SelectItem>
                <SelectItem value="PESQUISADOR">Pesquisador</SelectItem>
                <SelectItem value="COLABORADOR">Colaborador</SelectItem>
                <SelectItem value="VOLUNTARIO">Voluntário</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filtrar por projeto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Esta semana</SelectItem>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="quarter">Este trimestre</SelectItem>
                <SelectItem value="year">Este ano</SelectItem>
                <SelectItem value="all">Todo período</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={exportReport} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas gerais */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Horas</p>
                <p className="text-2xl font-bold">{formatHours(getTotalHours())}</p>
              </div>
              <Clock className="h-8 w-8 text-blue-600 dark:text-info" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total de Sessões</p>
                <p className="text-2xl font-bold">{getTotalSessions()}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-green-600 dark:text-success" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Usuários Ativos</p>
                <p className="text-2xl font-bold">{hoursReports.filter(r => r.totalHours > 0).length}</p>
              </div>
              <Users className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Média por Usuário</p>
                <p className="text-2xl font-bold">{formatHours(getAverageHours())}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de relatórios */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Relatório Detalhado por Usuário
          </CardTitle>
          <CardDescription>
            Análise individual de horas trabalhadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-info"></div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Horas Totais</TableHead>
                  <TableHead>Esta Semana</TableHead>
                  <TableHead>Sessões</TableHead>
                  <TableHead>Duração Média</TableHead>
                  <TableHead>Projetos</TableHead>
                  <TableHead>Produtividade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report) => {
                  const user = users.find(u => u.id === report.userId)
                  const productivity = report.totalHours > 0 ? 
                    (report.sessionsCount / report.totalHours) : 0
                  
                  return (
                    <TableRow key={report.userId}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-info/15 flex items-center justify-center">
                            <span className="text-sm font-medium text-blue-600 dark:text-info">
                              {report.userName.split(' ').map((n: string) => n[0]).join('')}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium">{report.userName}</p>
                            <p className="text-sm text-muted-foreground">
                              {user?.roles?.[0] || 'Usuário'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{formatHours(report.totalHours)}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium text-green-600 dark:text-success">
                          {formatHours(report.currentWeekHours)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{report.sessionsCount}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatHours(report.averageSessionDuration)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(report.projectHours).map(([projectId, hours]) => {
                            const project = projects.find(p => p.id === parseInt(projectId))
                            return (
                              <Badge key={projectId} variant="secondary" className="text-xs">
                                {project?.name}: {formatHours(hours)}
                              </Badge>
                            )
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={Math.min(productivity * 20, 100)} 
                            className="w-16 h-2" 
                          />
                          <span className="text-sm text-muted-foreground">
                            {productivity > 0 ? 'Alta' : 'Baixa'}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Top performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Top Performers
            </CardTitle>
            <CardDescription>
              Usuários com mais horas trabalhadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {hoursReports
                .sort((a, b) => b.totalHours - a.totalHours)
                .slice(0, 5)
                .map((report, index) => (
                  <div key={report.userId} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-yellow-100 dark:bg-warning/15 flex items-center justify-center">
                        <span className="text-xs font-bold text-yellow-600 dark:text-warning">
                          {index + 1}
                        </span>
                      </div>
                      <span className="font-medium">{report.userName}</span>
                    </div>
                    <Badge variant="outline">
                      {formatHours(report.totalHours)}
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Projetos Mais Ativos
            </CardTitle>
            <CardDescription>
              Projetos com mais horas trabalhadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {projects.map(project => {
                const projectHours = hoursReports.reduce((sum, report) => 
                  sum + (report.projectHours[project.id] || 0), 0
                )
                
                if (projectHours === 0) return null
                
                return (
                  <div key={project.id} className="flex items-center justify-between">
                    <span className="font-medium">{project.name}</span>
                    <Badge variant="outline">
                      {formatHours(projectHours)}
                    </Badge>
                  </div>
                )
              }).filter(Boolean).slice(0, 5)}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
