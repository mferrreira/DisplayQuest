"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Calendar, Clock, Flag, Target, Eye, Globe } from "lucide-react"
import type { Task } from "@/contexts/types"

interface TaskDetailDialogProps {
  task: Task | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const statusLabels: Record<string, string> = {
  "to-do": "A Fazer",
  "in-progress": "Em Progresso",
  "in-review": "Em Revisão",
  "adjust": "Ajuste",
  "done": "Concluído",
}

const statusColors: Record<string, string> = {
  "to-do": "bg-gray-100 text-gray-800 dark:bg-muted/50 dark:text-gray-200",
  "in-progress": "bg-blue-100 text-blue-800 dark:bg-info/15 dark:text-blue-300",
  "in-review": "bg-yellow-100 text-yellow-800 dark:bg-warning/15 dark:text-yellow-300",
  "adjust": "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  "done": "bg-green-100 text-green-800 dark:bg-success/15 dark:text-green-300",
}

const priorityLabels: Record<string, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
}

const priorityColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-success/15 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-warning/15 dark:text-yellow-300",
  high: "bg-red-100 text-red-800 dark:bg-destructive/15 dark:text-red-300",
}

const visibilityLabels: Record<string, string> = {
  public: "Pública",
  delegated: "Delegada",
  private: "Privada",
}

export function TaskDetailDialog({ task, open, onOpenChange }: TaskDetailDialogProps) {
  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg h-[90vh]" style={{ overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle className="text-lg">{task.title}</DialogTitle>
          {task.description && (
            <DialogDescription className="text-sm whitespace-pre-wrap">
              {task.description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={statusColors[task.status]}>
              {statusLabels[task.status] || task.status}
            </Badge>
            <Badge variant="outline" className={priorityColors[task.priority] || ""}>
              <Flag className="h-3 w-3 mr-1" />
              {priorityLabels[task.priority] || task.priority}
            </Badge>
            {task.taskVisibility && (
              <Badge variant="outline">
                {task.taskVisibility === "public" ? (
                  <Globe className="h-3 w-3 mr-1" />
                ) : (
                  <Eye className="h-3 w-3 mr-1" />
                )}
                {visibilityLabels[task.taskVisibility] || task.taskVisibility}
              </Badge>
            )}
          </div>

          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              {task.points > 0 && (
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span>{task.points} pontos</span>
                </div>
              )}
              {task.dueDate && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Vencimento: {new Date(task.dueDate).toLocaleDateString("pt-BR")}</span>
                </div>
              )}
              {task.completedAt && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Concluído em: {new Date(task.completedAt).toLocaleDateString("pt-BR")}</span>
                </div>
              )}
              {task.isGlobal && (
                <Badge variant="secondary" className="w-fit">Tarefa Global</Badge>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
