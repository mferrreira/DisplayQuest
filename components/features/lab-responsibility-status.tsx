"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Clock, User } from "lucide-react"
import { useResponsibility } from "@/contexts/responsibility-context"
import { useAuth } from "@/contexts/auth-context"

// Função para formatar duração em hh:mm:ss
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    secs.toString().padStart(2, "0"),
  ].join(":")
}

export function LabResponsibilityStatus() {
  const { activeResponsibility, loading, error } = useResponsibility()
  const { user } = useAuth()
  const [formattedStartTime, setFormattedStartTime] = useState("")

  useEffect(() => {
    if (activeResponsibility?.startTime) {
      setFormattedStartTime(new Date(activeResponsibility.startTime).toLocaleTimeString())
    } else {
      setFormattedStartTime("")
    }
  }, [activeResponsibility?.startTime])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span>Carregando...</span>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 text-destructive">
          <p>Erro ao carregar status do laboratório</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        {activeResponsibility ? (
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <Badge variant="default" className="bg-green-500">
                Laboratório em uso
              </Badge>
              <span className="text-sm text-muted-foreground">
                Desde {formattedStartTime}
              </span>
            </div>
            
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 mb-3 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1">
                <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Responsável Atual:</span>
              </div>
              <div className="text-lg font-semibold text-blue-900 dark:text-blue-100">
                {activeResponsibility.userName}
                {user && activeResponsibility.userId === user.id && (
                  <span className="ml-2 text-sm text-blue-600 dark:text-blue-400">(Você)</span>
                )}
              </div>
              {activeResponsibility.userRole && (
                <div className="mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {activeResponsibility.userRole === "COORDENADOR" ? "Administrador de Laboratório" :
                     activeResponsibility.userRole === "LABORATORISTA" ? "Laboratorista" :
                     activeResponsibility.userRole === "GERENTE_PROJETO" ? "Gerente de Projeto" :
                     activeResponsibility.userRole === "VOLUNTARIO" ? "Voluntário" :
                     activeResponsibility.userRole}
                  </Badge>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Duração:</span>
              <span className="font-mono text-lg font-semibold">{formatDuration(activeResponsibility.duration)}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-4">
            <Badge variant="outline" className="mb-3">
              Laboratório disponível
            </Badge>
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Ninguém está responsável pelo laboratório no momento.</p>
              <p className="text-xs text-muted-foreground">O laboratório está livre para uso.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
