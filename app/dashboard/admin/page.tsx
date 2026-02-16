"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { useProject } from "@/contexts/project-context"
import { useTask } from "@/contexts/task-context"
import { ModernAdminPanel } from "@/components/admin/ModernAdminPanel"
import { WorkSessionsAPI } from "@/contexts/api-client"
import type { WorkSession } from "@/contexts/types"

export default function AdminDashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { users } = useUser()
  const { projects } = useProject()
  const { tasks } = useTask()
  const [sessions, setSessions] = useState<WorkSession[]>([])

  useEffect(() => {
    const fetchSessions = async () => {
      if (!user) {
        setSessions([])
        return
      }

      try {
        const response = await WorkSessionsAPI.getAll()
        setSessions(Array.isArray(response) ? response : [])
      } catch (error) {
        console.error("Erro ao carregar sessões de trabalho:", error)
        setSessions([])
      }
    }

    fetchSessions()
  }, [user])

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  const isAdmin = user?.roles.includes("COORDENADOR") || user?.roles.includes("GERENTE")

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 container mx-auto p-4 md:p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Carregando painel administrativo...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 container mx-auto p-4 md:p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Acesso Negado</h2>
              <p className="text-muted-foreground">
                Você não tem permissão para acessar o painel administrativo.
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // Estatísticas básicas
  const completedTasks = tasks.filter(t => t.status === 'done').length
  const totalTasks = tasks.length
  const avgCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0
  
  const stats = {
    totalUsers: users.length,
    totalProjects: projects.length,
    totalTasks: totalTasks,
    completedTasks: completedTasks,
    activeResponsibilities: 0, // Temporariamente 0, pode ser implementado depois
    totalPoints: users.reduce((sum, u) => sum + (u.points || 0), 0),
    avgCompletionRate: avgCompletionRate,
    totalSessions: sessions.length,
    activeUsers: users.filter(u => u.status === 'active').length
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 container mx-auto p-4 md:p-6">
        <ModernAdminPanel
          users={users}
          projects={projects}
          tasks={tasks}
          sessions={sessions}
          stats={stats}
        />
      </main>
    </div>
  )
}
