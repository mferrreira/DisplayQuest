"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Edit, Trash2, Calendar } from "lucide-react"
import type { DailyLog, User } from "@/contexts/types"

interface DailyLogListProps {
  logs: DailyLog[]
  currentUser: User | null
  onEdit?: (log: DailyLog) => void
  onDelete?: (id: number) => void
  isSubmitting: boolean
}

export function DailyLogList({ logs, currentUser, onEdit, onDelete, isSubmitting, showAuthor = false }: DailyLogListProps & { showAuthor?: boolean }) {
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set())

  const toggleExpanded = (logId: number) => {
    const newExpanded = new Set(expandedLogs)
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId)
    } else {
      newExpanded.add(logId)
    }
    setExpandedLogs(newExpanded)
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
        <p>Nenhum registro encontrado.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {logs.map((log) => (
        <Card key={log.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <span className="font-medium text-blue-900">
                    {formatDate(log.createdAt || log.date)}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {formatTime(log.createdAt || log.date)}
                  </Badge>
                  {showAuthor && log.user && (
                    <span className="ml-2 text-xs text-muted-foreground">{log.user.name} ({log.user.email})</span>
                  )}
                </div>

                <div className="text-gray-700">
                  {log.note && log.note.length > 200 && !expandedLogs.has(log.id) ? (
                    <div>
                      <p className="whitespace-pre-line">
                        {log.note.substring(0, 200)}...
                      </p>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto text-blue-600"
                        onClick={() => toggleExpanded(log.id)}
                      >
                        Ler mais
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <p className="whitespace-pre-line">{log.note}</p>
                      {log.note && log.note.length > 200 && expandedLogs.has(log.id) && (
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 h-auto text-blue-600"
                          onClick={() => toggleExpanded(log.id)}
                        >
                          Ler menos
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {currentUser && log.userId === currentUser.id && onEdit && onDelete && (
                <div className="flex gap-2 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(log)}
                    disabled={isSubmitting}
                    className="h-8 w-8 p-0"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(log.id)}
                    disabled={isSubmitting}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
} 
