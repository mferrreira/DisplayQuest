import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Clock, PlayCircle, Pause, Square } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useWorkSessions } from "@/hooks/use-work-sessions"

interface TimerCardProps {
  onSessionEnd?: (updatedUser?: unknown) => void
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((value) => value.toString().padStart(2, "0")).join(":")
}

export function TimerCard({ onSessionEnd }: TimerCardProps) {
  const { user } = useAuth()
  const { currentSession, getElapsedSeconds } = useWorkSessions()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!currentSession || currentSession.userId !== user?.id) {
      setElapsedSeconds(0)
      return
    }

    setElapsedSeconds(getElapsedSeconds(currentSession))
    const interval = setInterval(() => {
      setElapsedSeconds(getElapsedSeconds(currentSession))
    }, 1000)

    return () => clearInterval(interval)
  }, [currentSession, user?.id, getElapsedSeconds])

  useEffect(() => {
    if (!currentSession || currentSession.status !== "completed") return
    onSessionEnd?.()
  }, [currentSession, onSessionEnd])

  const sessionStatus = useMemo(() => {
    if (!currentSession) return "idle" as const
    if (currentSession.status === "paused") return "paused" as const
    if (currentSession.status === "active") return "active" as const
    return "idle" as const
  }, [currentSession])

  const openFloatingTimer = () => {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("floating-session-timer:open"))
  }

  return (
    <Card className="mb-4 border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <span>Timer de Atividade</span>
          </span>
          {sessionStatus === "active" && <Badge className="bg-green-600">Ativa</Badge>}
          {sessionStatus === "paused" && <Badge variant="secondary">Pausada</Badge>}
          {sessionStatus === "idle" && <Badge variant="outline">Sem sessão</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-3xl font-mono text-blue-900 font-bold">{formatTime(elapsedSeconds)}</div>

        {currentSession && currentSession.userId === user?.id ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>Atividade: {currentSession.activity || "Trabalho geral"}</div>
            <div>Local: {currentSession.location || "Nao especificado"}</div>
            <div>Projeto: {currentSession.projectId ? `#${currentSession.projectId}` : "Sem projeto especifico"}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma sessao ativa. Use o controle flutuante para iniciar uma work session.
          </p>
        )}

        <Button onClick={openFloatingTimer} className="w-full">
          {sessionStatus === "active" && <Pause className="mr-2 h-4 w-4" />}
          {sessionStatus === "paused" && <PlayCircle className="mr-2 h-4 w-4" />}
          {sessionStatus === "idle" && <Square className="mr-2 h-4 w-4" />}
          Abrir controle de sessao
        </Button>
      </CardContent>
    </Card>
  )
}
