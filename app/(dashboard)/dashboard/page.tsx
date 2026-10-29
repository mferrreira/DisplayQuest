"use client"

/**
 * /dashboard — Task board (E2/T2.8 swap) + região de cabeçalho do plan-v6 · V6-3
 * (RF-V6.4, AC-V6-11, DEC-114).
 *
 * Data layer: features/tasks (TanStack Query). Legacy task-context is no longer mounted here.
 *
 * Cabeçalho compacto para dar prioridade vertical ao quadro. O resumo (faixa de gráficos)
 * usa os dados que a página já carrega (tarefas, projetos e sessão) e fica ACIMA do quadro,
 * para as estatísticas aparecerem sem rolagem. Sem coluna secundária (DEC-114): as cinco
 * colunas mantêm a largura horizontal disponível.
 */
import { PageHeader } from "@/components/ui/page-header"
import { useAuth } from "@/contexts/auth-context"
import { useProjects } from "@/features/projects"
import { useTasks } from "@/features/tasks"
import { TaskBoard } from "@/features/tasks/components/task-board"
import { HomeOverview } from "@/features/tasks/components/home-overview"

export default function DashboardPage() {
  const { user } = useAuth()
  const { data: projects = [] } = useProjects()
  // Chave igual à do quadro sem filtro (queryKeys.tasks.list({})) — TanStack deduplica.
  const { data: tasks = [] } = useTasks({})

  const firstName = user?.name?.split(" ")[0] ?? ""

  return (
    <div className="flex min-h-screen flex-col">
      <main className="container mx-auto flex-1 p-4 md:p-6">
        <div className="mb-4">
          <PageHeader
            title={firstName ? `Olá, ${firstName}!` : "Painel de Tarefas"}
            description="Acompanhe os projetos, suas metas e as tarefas do laboratório."
          />
        </div>
        <HomeOverview
          projects={projects}
          tasks={tasks}
          weekHours={user?.weekHours ?? 0}
          currentWeekHours={user?.currentWeekHours ?? 0}
        />
        <TaskBoard />
      </main>
    </div>
  )
}
