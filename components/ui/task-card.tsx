"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { MoreHorizontal, Edit, Calendar, User, Flag, Users, Star, Crown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { Task } from "@/contexts/types"
import { useUser } from "@/contexts/user-context"
import { formatDateOnly } from "@/lib/date-only"

interface TaskCardProps {
  task: Task
  onEdit?: (task: Task) => void
  isOverdue?: boolean
  showActions?: boolean
  className?: string
  variant?: "default" | "compact" | "detailed"
}

export function TaskCard({ 
  task, 
  onEdit, 
  isOverdue = false, 
  showActions = true,
  className = "",
  variant = "default"
}: TaskCardProps) {
  const { users } = useUser()
  const [isHovered, setIsHovered] = useState(false)

  const isPublicTask = task.taskVisibility === "public"
  const isHighPriority = task.priority === "high"
  const isHighPoints = task.points >= 50

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-gradient-to-r from-red-500 to-pink-500 text-white border-red-400 shadow-lg shadow-red-500/25 dark:from-red-500/20 dark:to-pink-500/20 dark:text-red-300 dark:border-red-500/40 dark:shadow-none"
      case "medium":
        return "bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-yellow-400 shadow-lg shadow-yellow-500/25 dark:from-yellow-500/20 dark:to-orange-500/20 dark:text-yellow-300 dark:border-yellow-500/40 dark:shadow-none"
      case "low":
        return "bg-gradient-to-r from-green-500 to-emerald-500 text-white border-green-400 shadow-lg shadow-green-500/25 dark:from-green-500/20 dark:to-emerald-500/20 dark:text-green-300 dark:border-green-500/40 dark:shadow-none"
      default:
        return "bg-gradient-to-r from-gray-500 to-slate-500 text-white border-gray-400 dark:from-slate-500/20 dark:to-gray-500/20 dark:text-gray-300 dark:border-gray-500/40"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "done":
        return "bg-gradient-to-r from-emerald-500 to-green-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/25 dark:from-emerald-500/20 dark:to-green-500/20 dark:text-emerald-300 dark:border-emerald-500/40 dark:shadow-none"
      case "in-progress":
        return "bg-gradient-to-r from-blue-500 to-cyan-500 text-white border-blue-400 shadow-lg shadow-blue-500/25 dark:from-blue-500/20 dark:to-cyan-500/20 dark:text-blue-300 dark:border-blue-500/40 dark:shadow-none"
      case "in-review":
        return "bg-gradient-to-r from-purple-500 to-violet-500 text-white border-purple-400 shadow-lg shadow-purple-500/25 dark:from-purple-500/20 dark:to-violet-500/20 dark:text-purple-300 dark:border-purple-500/40 dark:shadow-none"
      case "adjust":
        return "bg-gradient-to-r from-orange-500 to-amber-500 text-white border-orange-400 shadow-lg shadow-orange-500/25 dark:from-orange-500/20 dark:to-amber-500/20 dark:text-orange-300 dark:border-orange-500/40 dark:shadow-none"
      default:
        return "bg-gradient-to-r from-slate-500 to-gray-500 text-white border-slate-400 dark:from-slate-500/20 dark:to-gray-500/20 dark:text-slate-300 dark:border-slate-500/40"
    }
  }

  const getPointsStyle = () => {
    if (isHighPoints) {
      return "bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-yellow-300 shadow-lg shadow-yellow-500/25 dark:from-yellow-500/20 dark:to-amber-500/20 dark:text-yellow-300 dark:border-yellow-500/40 dark:shadow-none"
    }
    return "bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-blue-400 shadow-lg shadow-blue-500/25 dark:from-blue-500/20 dark:to-indigo-500/20 dark:text-blue-300 dark:border-blue-500/40 dark:shadow-none"
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null
    return formatDateOnly(dateString)
  }

  const getProgressValue = () => {
    switch (task.status) {
      case "done": return 100
      case "in-progress": return 50
      case "in-review": return 75
      case "adjust": return 90
      default: return 0
    }
  }

  const getAssigneeName = () => {
    if (!task.assignedTo) return "Não atribuído"
    const assignedUser = users.find((u) => u.id === Number(task.assignedTo))
    return assignedUser?.name || `Usuário #${task.assignedTo}`
  }

  const getCardStyle = () => {
    const baseStyle = "transition-all duration-200 hover:shadow-lg"
    
    if (isPublicTask) {
      return `${baseStyle} hover:scale-105 ${
        isOverdue 
          ? "border-red-400 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-500/10 dark:to-red-500/5" 
          : "border-amber-400 dark:border-amber-500/40 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-400/10 dark:via-yellow-300/5 dark:to-orange-400/10"
      } relative overflow-hidden`
    }
    
    return `${baseStyle} hover:scale-102 ${
      isOverdue 
        ? "border-red-300 bg-gradient-to-br from-red-50 to-red-100 dark:border-red-500/40 dark:from-red-500/10 dark:to-red-500/5" 
        : "border-gray-200 bg-gradient-to-br from-white to-gray-50 dark:border-gray-600 dark:from-gray-800 dark:to-gray-700"
    }`
  }

  const renderCompact = () => (
    <Card className={`${getCardStyle()} ${className}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm line-clamp-1 flex-1 mr-2">
            {task.title}
            {isPublicTask && <span className="ml-1">⚡</span>}
          </h3>
          <div className="flex items-center gap-1">
            {task.points > 0 && (
              <Badge className={`text-xs ${getPointsStyle()}`}>
                {task.points} pts
              </Badge>
            )}
            {showActions && onEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onEdit(task)}
              >
                <Edit className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const renderDetailed = () => (
    <Card className={`${getCardStyle()} ${className}`}>
      <CardContent className="p-4">
        {/* Public Task Special Effects */}
        {isPublicTask && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-200/20 dark:via-yellow-500/10 to-transparent animate-pulse pointer-events-none" />
        )}
        
        {/* Public Task Crown */}
        {isPublicTask && (
          <div className="absolute -top-2 -right-2 z-10">
             {/* dark-mode:ok (dourado nos 2 temas) */}
                      <div className="bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full p-1 shadow-lg">
              <Crown className="h-4 w-4 text-white" /> {/* dark-mode:ok */}
            </div>
          </div>
        )}

        <div className="flex items-start justify-between mb-3">
          <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100 line-clamp-2 flex-1 mr-2">
            {task.title}
            {isPublicTask && <span className="ml-1">⚡</span>}
          </h3>
          {showActions && onEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 opacity-0 transition-opacity ${
                    isHovered ? "opacity-100" : ""
                  }`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(task)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {task.description && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
            {task.description}
          </p>
        )}

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 dark:text-muted-foreground mb-1">
            <span>Progresso</span>
            <span>{getProgressValue()}%</span>
          </div>
          <Progress value={getProgressValue()} className="h-2" />
        </div>

        {/* Badges */}
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
            <Badge className="text-xs font-bold bg-gradient-to-r from-yellow-400 to-amber-500 text-white border-yellow-300 shadow-lg shadow-yellow-500/25 animate-pulse dark:from-yellow-500/20 dark:to-amber-500/20 dark:text-yellow-300 dark:border-yellow-500/40 dark:shadow-none">
              <Users className="mr-1 h-3 w-3" />
              PÚBLICA
            </Badge>
          )}
          {task.points > 0 && (
            <Badge className={`text-xs font-bold ${getPointsStyle()}`}>
              {isHighPoints && <Star className="mr-1 h-3 w-3" />}
              {task.points} pts
            </Badge>
          )}
        </div>

        {/* Footer Info */}
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
          {task.assignedTo && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  <User className="h-3 w-3 mr-1" />
                  <span className="truncate max-w-20">Responsável</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Atribuído a: {getAssigneeName()}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </CardContent>
    </Card>
  )

  return (
    <TooltipProvider>
      <div
        className="group"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {variant === "compact" ? renderCompact() : renderDetailed()}
      </div>
    </TooltipProvider>
  )
} 
