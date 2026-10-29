"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { WeeklyBarChart } from "@/components/ui/data-charts"
import { StatCard } from "@/components/ui/stat-card"
import {
  Clock,
  TrendingUp,
  Users,
  Calendar,
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

/** "dd/MM/yyyy" (o que a API emite) vira "dd/MM" para o eixo do gráfico. */
function weekAxisLabel(weekStart: string) {
  return weekStart.slice(0, 5)
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
          // A API devolve as semanas da mais recente para a mais antiga; o gráfico lê da
          // esquerda (mais antiga) para a direita (atual), como o de tarefas concluídas.
          weeklyHistory: (historyData.history?.weeks || []).slice(0, 8)
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
      <div className="rounded-lg border p-4 md:p-5">
        <div className="mb-4 h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <Clock className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold">Nenhuma hora registrada</h3>
        <p className="text-muted-foreground">
          Este projeto ainda não possui horas trabalhadas registradas.
        </p>
      </div>
    )
  }

  const formatHours = (hours: number) => {
    if (hours <= 0) return "0h"
    if (hours < 1) {
      return `${Math.round(hours * 60)}min`
    }
    return `${Math.round(hours * 10) / 10}h`
  }

  const averageWeekly = stats.weeklyHistory.length > 0
    ? stats.weeklyHistory.reduce((sum, week) => sum + week.totalHours, 0) / stats.weeklyHistory.length
    : 0

  const chartWeeks = [...stats.weeklyHistory].reverse().map((week) => ({
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    label: weekAxisLabel(week.weekStart),
    count: week.totalHours,
  }))

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total de Horas" value={formatHours(stats.totalHours)} hint="Desde o início do projeto" icon={Clock} />
        <StatCard label="Esta Semana" value={formatHours(stats.currentWeekHours)} hint="Semana atual, de segunda a domingo" icon={Calendar} />
        <StatCard label="Membros com Horas" value={stats.memberCount} hint="Registraram horas no projeto" icon={Users} />
        <StatCard label="Média Semanal" value={formatHours(averageWeekly)} hint={`Últimas ${stats.weeklyHistory.length} semanas`} icon={TrendingUp} />
      </div>

      {stats.weeklyHistory.length > 0 && (
        <section aria-labelledby="project-weekly-hours-title" className="rounded-lg border p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 id="project-weekly-hours-title" className="text-sm font-semibold">Histórico semanal</h2>
              <p className="text-xs text-muted-foreground">Horas trabalhadas por semana · últimas {stats.weeklyHistory.length} semanas</p>
            </div>
            <span className="text-xs text-muted-foreground">Semana de segunda a domingo</span>
          </div>
          <WeeklyBarChart
            label={`${project.name}. Histórico semanal de horas trabalhadas`}
            weeks={chartWeeks}
            formatValue={formatHours}
            valueNoun="horas trabalhadas"
          />
        </section>
      )}

      <section aria-labelledby="project-top-contributors-title" className="rounded-lg border p-4 md:p-5">
        <div className="mb-4">
          <h2 id="project-top-contributors-title" className="flex items-center gap-2 text-sm font-semibold">
            <Target className="h-4 w-4 text-muted-foreground" />
            Top contribuidores
          </h2>
          <p className="text-xs text-muted-foreground">Membros com mais horas trabalhadas no projeto</p>
        </div>
        {stats.topContributors.length === 0 ? (
          <div className="py-8 text-center">
            <Users className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">Nenhum contribuidor</h3>
            <p className="text-muted-foreground">Ainda não há horas registradas para este projeto.</p>
          </div>
        ) : (
          <ol className="divide-y">
            {stats.topContributors.map((contributor, index) => (
              <li key={contributor.userId} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="text-xs">
                      {contributor.userName.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{contributor.userName}</div>
                    <div className="text-xs text-muted-foreground">
                      Esta semana: {formatHours(contributor.currentWeekHours)}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-right">
                  <span className="font-semibold tabular-nums">{formatHours(contributor.totalHours)}</span>
                  <Badge variant="outline" className="text-xs">
                    {stats.totalHours > 0 ? Math.round((contributor.totalHours / stats.totalHours) * 100) : 0}% do total
                  </Badge>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
