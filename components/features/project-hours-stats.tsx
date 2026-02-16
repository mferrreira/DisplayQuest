"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { 
  Clock, 
  TrendingUp, 
  Users, 
  Calendar,
  BarChart3,
  Target
} from "lucide-react"
import type { Project } from "@/contexts/types"

interface ProjectHoursStatsProps {
  project: Project
}

interface ProjectStats {
  totalHours: number
  currentWeekHours: number
  memberCount: number
  topContributors: Array<{
    userId: number
    userName: string
    totalHours: number
    currentWeekHours: number
  }>
  weeklyHistory: Array<{
    weekStart: string
    weekEnd: string
    totalHours: number
  }>
}

export function ProjectHoursStats({ project }: ProjectHoursStatsProps) {
  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProjectStats()
  }, [project.id])

  const fetchProjectStats = async () => {
    try {
      setLoading(true)
      
      // Buscar horas do projeto
      const hoursResponse = await fetch(`/api/projects/${project.id}/hours`)
      const hoursData = await hoursResponse.json()

      const now = new Date()
      const weekStartDate = new Date(now)
      weekStartDate.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      weekStartDate.setHours(0, 0, 0, 0)

      const weekEndDate = new Date(weekStartDate)
      weekEndDate.setDate(weekStartDate.getDate() + 6)
      weekEndDate.setHours(23, 59, 59, 999)

      const currentWeekResponse = await fetch(
        `/api/projects/${project.id}/hours?weekStart=${encodeURIComponent(weekStartDate.toISOString())}&weekEnd=${encodeURIComponent(weekEndDate.toISOString())}`,
      )
      const currentWeekData = await currentWeekResponse.json()
      
      if (hoursResponse.ok && hoursData.hours) {
        const hours = hoursData.hours
        
        // Buscar histórico semanal
        const historyResponse = await fetch(`/api/projects/${project.id}/hours-history?months=4`)
        const historyData = await historyResponse.json()
        
        const projectStats: ProjectStats = {
          totalHours: hours.totalHours || 0,
          currentWeekHours: currentWeekData?.hours?.totalHours || 0,
          memberCount: hours.hoursByUser?.length || 0,
          topContributors: hours.hoursByUser?.slice(0, 5).map((user: any) => {
            const currentWeekContributor = currentWeekData?.hours?.hoursByUser?.find((entry: any) => entry.userId === user.userId)
            return ({
            userId: user.userId,
            userName: user.userName,
            totalHours: user.totalHours || 0,
            currentWeekHours: currentWeekContributor?.totalHours || 0
          })}) || [],
          weeklyHistory: historyData.history?.weeks?.slice(0, 8) || []
        }
        
        setStats(projectStats)
      }
    } catch (error) {
      console.error('Erro ao buscar estatísticas do projeto:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Estatísticas de Horas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Carregando estatísticas...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Estatísticas de Horas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma hora registrada</h3>
            <p className="text-muted-foreground">
              Este projeto ainda não possui horas trabalhadas registradas.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatHours = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}min`
    }
    return `${Math.round(hours * 10) / 10}h`
  }

  return (
    <div className="space-y-6">
      {/* Cards de Estatísticas Principais */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Horas</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(stats.totalHours)}</div>
            <p className="text-xs text-muted-foreground">
              Desde o início do projeto
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Esta Semana</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatHours(stats.currentWeekHours)}</div>
            <p className="text-xs text-muted-foreground">
              Últimos 7 dias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Membros Ativos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.memberCount}</div>
            <p className="text-xs text-muted-foreground">
              Com horas registradas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Média Semanal</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatHours(stats.weeklyHistory.length > 0 
                ? stats.weeklyHistory.reduce((sum, week) => sum + week.totalHours, 0) / stats.weeklyHistory.length 
                : 0
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Últimas {stats.weeklyHistory.length} semanas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top Contribuidores */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Top Contribuidores
          </CardTitle>
          <CardDescription>
            Membros com mais horas trabalhadas no projeto
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.topContributors.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum contribuidor</h3>
              <p className="text-muted-foreground">
                Ainda não há horas registradas para este projeto.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {stats.topContributors.map((contributor, index) => (
                <div key={contributor.userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                      {index + 1}
                    </div>
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {contributor.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{contributor.userName}</div>
                      <div className="text-sm text-muted-foreground">
                        Esta semana: {formatHours(contributor.currentWeekHours)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatHours(contributor.totalHours)}</div>
                    <Badge variant="outline" className="text-xs">
                      {Math.round((contributor.totalHours / stats.totalHours) * 100)}% do total
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Histórico Semanal */}
      {stats.weeklyHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Histórico Semanal
            </CardTitle>
            <CardDescription>
              Horas trabalhadas nas últimas semanas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.weeklyHistory.slice(0, 8).map((week, index) => {
                const maxHours = Math.max(...stats.weeklyHistory.map(w => w.totalHours))
                const percentage = maxHours > 0 ? (week.totalHours / maxHours) * 100 : 0
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">
                        {week.weekStart} - {week.weekEnd}
                      </span>
                      <span className="font-bold">{formatHours(week.totalHours)}</span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
