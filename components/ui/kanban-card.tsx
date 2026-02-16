"use client"

import { useState } from "react"
import { Draggable } from "@hello-pangea/dnd"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { MoreHorizontal, Edit, AlertTriangle, Calendar, User, Flag, Users, Star, Crown, Zap, Check, X } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { Task, KanbanCardProps } from "@/contexts/types"
import { useAuth } from "@/contexts/auth-context"
import { useProject } from "@/contexts/project-context"
import { useTask } from "@/contexts/task-context"
import { useToast } from "@/contexts/use-toast"

interface DraggableKanbanCardProps extends KanbanCardProps {
  index: number
}

export function KanbanCard({ task, onEdit, isOverdue, index }: DraggableKanbanCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const { user } = useAuth()
  const { projects } = useProject()
  const { approveTask, rejectTask } = useTask()
  const { toast } = useToast()

  // Verificar se o usuário pode aprovar/rejeitar tasks
  const canApproveRejectTask = () => {
    if (!user) return false
    
    // Coordenadores e gerentes podem aprovar/rejeitar qualquer task
    if (user.roles?.includes('COORDENADOR') || user.roles?.includes('GERENTE')) {
      return true
    }
    
    // Gerentes de projeto podem aprovar/rejeitar tasks do seu projeto
    if (user.roles?.includes('GERENTE_PROJETO') && task.projectId) {
      const project = projects.find(p => p.id === task.projectId)
      return project?.leaderId === user.id
    }
    
    return false
  }

  const handleApproveTask = async (taskId: number) => {
    try {
      await approveTask(taskId)
      toast({
        title: "Tarefa aprovada",
        description: "A tarefa foi aprovada com sucesso.",
      })
    } catch (error) {
      console.error('Erro ao aprovar tarefa:', error)
      toast({
        title: "Erro ao aprovar tarefa",
        description: error instanceof Error ? error.message : "Falha ao aprovar tarefa.",
        variant: "destructive",
      })
    }
  }

  const handleRejectTask = async (taskId: number) => {
    const reason = prompt('Motivo da rejeição (opcional):')
    
    try {
      await rejectTask(taskId, reason || undefined)
      toast({
        title: "Tarefa rejeitada",
        description: "A tarefa foi rejeitada com sucesso.",
      })
    } catch (error) {
      console.error('Erro ao rejeitar tarefa:', error)
      toast({
        title: "Erro ao rejeitar tarefa",
        description: error instanceof Error ? error.message : "Falha ao rejeitar tarefa.",
        variant: "destructive",
      })
    }
  }

  const isPublicTask = task.taskVisibility === "public"
  const isHighPriority = task.priority === "high"
  const isHighPoints = task.points >= 50
  const isGlobalTask = task.isGlobal

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-gradient-to-r from-red-500 to-pink-500 text-white border-red-400 shadow-lg shadow-red-500/25"
      case "medium":
        return "bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-yellow-400 shadow-lg shadow-yellow-500/25"
      case "low":
        return "bg-gradient-to-r from-green-500 to-emerald-500 text-white border-green-400 shadow-lg shadow-green-500/25"
      default:
        return "bg-gradient-to-r from-gray-500 to-slate-500 text-white border-gray-400"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "bg-gradient-to-r from-emerald-500 to-green-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/25"
      case "in-progress":
        return "bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-blue-400 shadow-lg shadow-blue-500/25"
      case "in-review":
        return "bg-gradient-to-r from-purple-500 to-violet-500 text-white border-purple-400 shadow-lg shadow-purple-500/25"
      case "adjust":
        return "bg-gradient-to-r from-orange-500 to-amber-500 text-white border-orange-400 shadow-lg shadow-orange-500/25"
      default:
        return "bg-gradient-to-r from-slate-500 to-gray-500 text-white border-slate-400"
    }
  }

  const getPointsStyle = () => {
    if (isHighPoints) {
      return "bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-yellow-300 shadow-lg shadow-yellow-500/25"
    }
    return "bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-blue-400 shadow-lg shadow-blue-500/25"
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    return new Date(dateString).toLocaleDateString("pt-BR")
  }

  return (
    <Draggable draggableId={task.id.toString()} index={index} isDragDisabled={task.status === 'done'}>
      {(provided, snapshot) => {
        const getCardStyle = () => {
          if (isPublicTask) {
            return `mb-3 cursor-grab transition-all duration-300 hover:shadow-2xl hover:scale-105 ${
              isOverdue ? "border-red-400 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20" : 
              "border-amber-400 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-900/30 dark:via-yellow-900/20 dark:to-orange-900/30"
            } ${snapshot.isDragging ? "shadow-2xl rotate-2" : ""} relative overflow-hidden`
          }
          
          return `mb-3 cursor-grab transition-all duration-200 hover:shadow-lg hover:scale-102 ${
            isOverdue ? "border-red-300 bg-gradient-to-br from-red-50 to-red-100 dark:border-red-600 dark:from-red-900/20 dark:to-red-800/10" : 
            "border-gray-200 bg-gradient-to-br from-white to-gray-50 dark:border-gray-600 dark:from-gray-800 dark:to-gray-700"
          } ${snapshot.isDragging ? "shadow-xl" : ""}`
        }

        return (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`${snapshot.isDragging ? "rotate-2 shadow-2xl" : ""}`}
            onDragStart={(e) => e.stopPropagation()}
            onDragEnd={(e) => e.stopPropagation()}
          >
            <TooltipProvider>
              <Card
                className={getCardStyle()}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                {/* Public Task Special Effects */}
                {isPublicTask && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-200/20 to-transparent animate-pulse pointer-events-none" />
                )}
                
                {/* Global Task Special Effects */}
                {isGlobalTask && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-200/20 to-transparent animate-pulse pointer-events-none" />
                )}
                
                <CardContent className="p-4 relative">
                  {/* Public Task Crown */}
                  {isPublicTask && (
                    <div className="absolute -top-2 -right-2 z-10">
                      <div className="bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full p-1 shadow-lg">
                        <Crown className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 line-clamp-2 flex-1 mr-2">
                      {task.title}
                      {isPublicTask && <span className="ml-1">⚡</span>}
                      {isGlobalTask && <span className="ml-1">🌍</span>}
                    </h3>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 w-6 p-0 opacity-0 transition-opacity ${
                            isHovered ? "opacity-100" : ""
                          }`}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation()
                          onEdit(task)
                        }}>
                          <Edit className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {task.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{task.description}</p>
                  )}

                  {/* Progress Bar for Task Completion */}
                  <div className="mb-3">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Progresso</span>
                      <span>{task.status === "done" ? "100%" : 
                            task.status === "in-progress" ? "50%" : 
                            task.status === "in-review" ? "75%" : 
                            task.status === "adjust" ? "90%" : "0%"}</span>
                    </div>
                    <Progress 
                      value={task.status === "done" ? 100 : 
                             task.status === "in-progress" ? 50 : 
                             task.status === "in-review" ? 75 : 
                             task.status === "adjust" ? 90 : 0} 
                      className="h-2"
                    />
                  </div>

                  <div className="flex flex-wrap gap-1 mb-3">
                    <Badge variant="outline" className={`text-xs font-bold ${getPriorityColor(task.priority)}`}>
                      <Flag className="mr-1 h-3 w-3" />
                      {task.priority === "high" ? "ALTA" : task.priority === "medium" ? "MÉDIA" : "BAIXA"}
                    </Badge>
                    <Badge variant="outline" className={`text-xs font-bold ${getStatusColor(task.status)}`}>
                      {task.status === "done" ? "CONCLUÍDA" : 
                       task.status === "in-progress" ? "EM ANDAMENTO" : 
                       task.status === "in-review" ? "EM REVISÃO" : 
                       task.status === "adjust" ? "AJUSTES" : "A FAZER"}
                    </Badge>
                    {isPublicTask && (
                      <Badge className="text-xs font-bold bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-yellow-300 shadow-lg shadow-yellow-500/25 animate-pulse">
                        <Users className="mr-1 h-3 w-3" />
                        PÚBLICA
                      </Badge>
                    )}
                    {isGlobalTask && (
                      <Badge className="text-xs font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-blue-300 shadow-lg shadow-blue-500/25 animate-pulse">
                        <Zap className="mr-1 h-3 w-3" />
                        QUEST GLOBAL
                      </Badge>
                    )}
                    {task.points > 0 && (
                      <Badge className={`text-xs font-bold ${getPointsStyle()}`}>
                        {isHighPoints && <Star className="mr-1 h-3 w-3" />}
                        {task.points} pts
                      </Badge>
                    )}
                  </div>

                  {/* Botões de aprovação/rejeição para tarefas em revisão */}
                  {task.status === "in-review" && canApproveRejectTask() && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleApproveTask(task.id)
                        }}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRejectTask(task.id)
                        }}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Rejeitar
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center space-x-2">
                      {task.dueDate && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              {formatDate(task.dueDate)}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Data de vencimento</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {isOverdue && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center text-red-600 dark:text-red-400 font-bold">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            ATRASADA
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Tarefa atrasada</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>

                  {/* Special Effects for High Priority Tasks */}
                  {isHighPriority && (
                    <div className="absolute top-2 left-2">
                      <div className="bg-red-500 rounded-full w-2 h-2 animate-ping" />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TooltipProvider>
          </div>
        )
      }}
    </Draggable>
  )
} 
