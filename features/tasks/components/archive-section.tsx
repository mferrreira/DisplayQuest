"use client"

/**
 * ArchiveSection (E2/T2.4) — legacy "Histórico de tarefas" collapsible (kanban-board :299–341).
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useState } from "react"
import type { Task } from "@/entities/task"

export interface ArchiveSectionProps {
  tasks: Task[]
  projects: Array<{ id: number; name: string }>
}

export function ArchiveSection({ tasks, projects }: ArchiveSectionProps) {
  const [open, setOpen] = useState(false)
  if (tasks.length === 0) return null

  const sorted = tasks.slice().sort((a, b) => {
    const aDate = a.completedAt ? new Date(a.completedAt).getTime() : a.dueDate ? new Date(a.dueDate).getTime() : 0
    const bDate = b.completedAt ? new Date(b.completedAt).getTime() : b.dueDate ? new Date(b.dueDate).getTime() : 0
    return bDate - aDate
  })

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="w-full text-left">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {open ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
                Histórico de tarefas
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {sorted.length} concluída(s) há mais de 1 semana
              </span>
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="max-h-[320px] space-y-3 overflow-y-auto pt-0">
            {sorted.map((task) => {
              const projectName = task.projectId
                ? projects.find((project) => project.id === task.projectId)?.name ?? `Projeto #${task.projectId}`
                : "Sem projeto"
              return (
                <div key={task.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="font-medium">{task.title}</div>
                  <div className="text-muted-foreground">
                    {projectName} • Concluída em:{" "}
                    {task.completedAt
                      ? new Date(task.completedAt).toLocaleDateString("pt-BR")
                      : "N/A"}{" "}
                    • {task.points} pts
                  </div>
                </div>
              )
            })}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}
