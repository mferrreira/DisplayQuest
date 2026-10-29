"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Edit, Plus, Upload } from "lucide-react"
import { taskStatusBadgeClass, taskStatusLabel } from "@/components/ui/status"
import { POINTS_PER_TASK } from "@/features/tasks"
import type { Task } from "@/contexts/types"

/**
 * S04 (plan-v11, R4) — o card "Tarefas do Projeto" da aba Tarefas do detalhe do projeto.
 *
 * Saiu do `page.tsx` para ter aceite de componente: a lista agora tem o teto da casa
 * (320px, o mesmo do feed "Atividade recente" — V6-11k) com rolagem interna, e a página
 * deixa de crescer com o estoque de tarefas. O scroller é `relative` pela lição da V6-11h
 * (absolute dentro de scroller exige ancestral positioned).
 */
interface ProjectTasksCardProps {
  tasks: Task[]
  users: { id: number; name: string }[]
  canCreate: boolean
  onCreateTask: () => void
  onImportBacklog: () => void
  onEditTask: (task: Task) => void
}

export function ProjectTasksCard({
  tasks,
  users,
  canCreate,
  onCreateTask,
  onImportBacklog,
  onEditTask,
}: ProjectTasksCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Tarefas do Projeto
          </CardTitle>
          {canCreate && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onImportBacklog} size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Importar Backlog
              </Button>
              <Button onClick={onCreateTask} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nova Tarefa
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-lg font-semibold">Nenhuma tarefa encontrada</h2>
            <p className="mb-4 text-muted-foreground">
              Este projeto ainda não possui tarefas. Crie a primeira tarefa para começar.
            </p>
            {canCreate && (
              <Button onClick={onCreateTask}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeira Tarefa
              </Button>
            )}
          </div>
        ) : (
          <ul className="relative max-h-80 space-y-3 overflow-y-auto pr-1">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-4 rounded-md border p-3 transition-colors hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{task.title}</h2>
                    <Badge className={taskStatusBadgeClass[task.status]}>{taskStatusLabel[task.status]}</Badge>
                    {task.taskVisibility === "public" && (
                      <Badge className="bg-info/15 text-info">Pública</Badge>
                    )}
                  </div>
                  {task.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{task.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>
                      Responsável: {task.assignedTo
                        ? users.find((person) => person.id === task.assignedTo)?.name ||
                          `Usuário #${task.assignedTo}`
                        : "Não atribuído"}
                    </span>
                    <span>Pontos: {POINTS_PER_TASK}</span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Editar tarefa ${task.title}`}
                  onClick={() => onEditTask(task)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
