"use client"

import { useState } from "react"
import { Draggable } from "@hello-pangea/dnd"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronDown, ChevronRight, Crown, AlertTriangle } from "lucide-react"
import type { Task, KanbanCardProps } from "@/contexts/types"
import { useUser } from "@/contexts/user-context"

interface DraggableKanbanCardCompactProps extends KanbanCardProps {
  index: number
}

export function KanbanCardCompact({ task, onEdit, isOverdue, index }: DraggableKanbanCardCompactProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const { users } = useUser()

  const isPublicTask = task.taskVisibility === "public"
  const isHighPriority = task.priority === "high"
  const assigneeIds = (task.assigneeIds?.length ? task.assigneeIds : (task.assignedTo ? [task.assignedTo] : []))
    .filter((id): id is number => typeof id === "number")
  const assigneeLabel = assigneeIds.length === 0
    ? null
    : assigneeIds
        .map((id) => users.find((u) => u.id === id)?.name || `#${id}`)
        .slice(0, 2)
        .join(", ") + (assigneeIds.length > 2 ? ` +${assigneeIds.length - 2}` : "")

  const getCardStyle = () => {
    if (isPublicTask) {
      return `mb-2 cursor-grab transition-all duration-300 hover:shadow-lg hover:scale-102 ${
        isOverdue ? "border-red-400 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/20" : 
        "border-amber-400 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-900/30 dark:via-yellow-900/20 dark:to-orange-900/30"
      } relative overflow-hidden`
    }
    
    return `mb-2 cursor-grab transition-all duration-200 hover:shadow-md hover:scale-101 ${
      isOverdue ? "border-red-300 bg-gradient-to-br from-red-50 to-red-100 dark:border-red-600 dark:from-red-900/20 dark:to-red-800/10" : 
      "border-gray-200 bg-gradient-to-br from-white to-gray-50 dark:border-gray-600 dark:from-gray-800 dark:to-gray-700"
    }`
  }

  return (
    <Draggable draggableId={task.id.toString()} index={index} isDragDisabled={task.status === 'done'}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`${snapshot.isDragging ? "rotate-1 shadow-xl" : ""}`}
          onDragStart={(e) => e.stopPropagation()}
          onDragEnd={(e) => e.stopPropagation()}
        >
          <Card
            className={getCardStyle()}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {/* Public Task Special Effects */}
            {isPublicTask && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-200/10 to-transparent animate-pulse pointer-events-none" />
            )}
            
            <CardContent className="p-3 relative">
              {/* Public Task Crown */}
              {isPublicTask && (
                <div className="absolute -top-1 -right-1 z-10">
                  <div className="bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full p-0.5 shadow-md">
                    <Crown className="h-3 w-3 text-white" />
                  </div>
                </div>
              )}

              {/* Compact Layout */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  {/* Expand/Collapse Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsExpanded(!isExpanded)
                    }}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </Button>

                  {/* Task Title */}
                  <h3 className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate flex-1">
                    {task.title}
                    {isPublicTask && <span className="ml-1">⚡</span>}
                  </h3>

                  {/* Priority Indicator */}
                  {isHighPriority && (
                    <div className="flex-shrink-0">
                      <div className="bg-red-500 rounded-full w-2 h-2 animate-pulse" />
                    </div>
                  )}

                  {/* Overdue Indicator */}
                  {isOverdue && (
                    <div className="flex-shrink-0">
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                    </div>
                  )}
                </div>

                {/* Points Badge (if any) */}
                {task.points > 0 && (
                  <div className="flex-shrink-0 ml-2">
                    <span className="text-xs font-bold bg-gradient-to-r from-blue-500 to-indigo-500 text-white px-2 py-0.5 rounded-full">
                      {task.points}pts
                    </span>
                  </div>
                )}
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                  {task.description && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                      {task.description}
                    </p>
                  )}

                  {assigneeLabel && (
                    <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 line-clamp-1">
                      Delegado{assigneeIds.length > 1 ? "s" : ""}: {assigneeLabel}
                    </p>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        task.priority === "high" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        task.priority === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" :
                        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      }`}>
                        {task.priority === "high" ? "ALTA" : task.priority === "medium" ? "MÉDIA" : "BAIXA"}
                      </span>
                      {isPublicTask && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                          PÚBLICA
                        </span>
                      )}
                    </div>
                    
                    {task.dueDate && (
                      <span className="text-xs">
                        {new Date(task.dueDate).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </Draggable>
  )
}


