"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useWorkSessions } from "@/hooks/use-work-sessions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Clock, Pause, PlayCircle, StopCircle } from "lucide-react"
import { useProject } from "@/contexts/project-context"

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((value) => value.toString().padStart(2, "0")).join(":")
}

export function FloatingSessionTimer() {
  const { user } = useAuth()
  const {
    currentSession,
    activeSession,
    startSession,
    pauseSession,
    resumeSession,
    endSession,
    fetchSessions,
    getElapsedSeconds,
    loading,
  } = useWorkSessions()
  const { projects } = useProject()

  const [expanded, setExpanded] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [showStopDialog, setShowStopDialog] = useState(false)
  const [logNote, setLogNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [startProjectId, setStartProjectId] = useState("")
  const [startActivity, setStartActivity] = useState("")
  const [startLocation, setStartLocation] = useState("")
  const [startError, setStartError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.id) return

    void fetchSessions(user.id)
    const interval = setInterval(() => {
      void fetchSessions(user.id)
    }, 5000)

    return () => clearInterval(interval)
  }, [user?.id, fetchSessions])

  useEffect(() => {
    if (!currentSession || currentSession.userId !== user?.id) {
      setSeconds(0)
      return
    }

    setSeconds(getElapsedSeconds(currentSession))
    const interval = setInterval(() => {
      setSeconds(getElapsedSeconds(currentSession))
    }, 1000)

    return () => clearInterval(interval)
  }, [currentSession, user?.id, getElapsedSeconds])

  if (!user) {
    return null
  }

  const handlePause = async () => {
    if (!activeSession) return
    await pauseSession(activeSession.id)
    await fetchSessions(user.id)
  }

  const handleResume = async () => {
    if (!currentSession || currentSession.status !== "paused") return
    await resumeSession(currentSession.id)
    await fetchSessions(user.id)
  }

  const handleStop = async (withLog: boolean) => {
    if (!currentSession) return
    setSubmitting(true)
    try {
      await endSession(currentSession.id, currentSession.activity || undefined, {
        dailyLogNote: withLog && logNote.trim() ? logNote.trim() : undefined,
      })
      setShowStopDialog(false)
      setLogNote("")
      await fetchSessions(user.id)
    } finally {
      setSubmitting(false)
    }
  }

  const handleStart = async () => {
    if (!user) return
    setStartError(null)

    const isCoordinatorOrManager = user.roles?.includes("COORDENADOR") || user.roles?.includes("GERENTE")
    if (!isCoordinatorOrManager && !startProjectId) {
      setStartError("Selecione um projeto para iniciar a sessão.")
      return
    }

    try {
      await startSession({
        userId: user.id,
        activity: startActivity || undefined,
        location: startLocation || undefined,
        projectId: startProjectId && startProjectId !== "no-project" ? Number(startProjectId) : undefined,
      })
      setStartProjectId("")
      setStartActivity("")
      setStartLocation("")
      await fetchSessions(user.id)
    } catch (error: any) {
      setStartError(error?.message || "Erro ao iniciar sessão")
    }
  }

  return (
    <>
      <div
        className={`fixed bottom-[6em] left-[6em] z-50 rounded-lg border bg-background/95 shadow-lg backdrop-blur transition-all duration-200 ${
          expanded ? "w-80 p-4" : "w-14 h-14 p-0"
        }`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {!expanded ? (
          <div className="w-full h-full flex items-center justify-center">
            <Clock className="h-5 w-5" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Sessão de Trabalho</p>
              <span className="text-xs text-muted-foreground">
                {!currentSession
                  ? "Sem sessão"
                  : currentSession.status === "paused"
                    ? "Pausada"
                    : "Ativa"}
              </span>
            </div>

            <p className="font-mono text-2xl font-bold">{formatTime(seconds)}</p>

            {!currentSession && (
              <div className="space-y-2">
                <Select value={startProjectId} onValueChange={setStartProjectId}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    {(user.roles?.includes("COORDENADOR") || user.roles?.includes("GERENTE")) && (
                      <SelectItem value="no-project">Sem projeto específico</SelectItem>
                    )}
                    {projects.length === 0 ? (
                      <SelectItem value="no-projects" disabled>
                        Nenhum projeto disponível
                      </SelectItem>
                    ) : (
                      projects.map((project) => (
                        <SelectItem key={project.id} value={String(project.id)}>
                          {project.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Input
                  className="h-8"
                  placeholder="Atividade (opcional)"
                  value={startActivity}
                  onChange={(event) => setStartActivity(event.target.value)}
                />
                <Input
                  className="h-8"
                  placeholder="Local (opcional)"
                  value={startLocation}
                  onChange={(event) => setStartLocation(event.target.value)}
                />
                {startError && <p className="text-xs text-red-600">{startError}</p>}
                <Button size="sm" onClick={handleStart} disabled={loading || startProjectId === "no-projects"}>
                  Iniciar sessão
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              {currentSession?.status === "active" ? (
                <Button size="sm" variant="outline" onClick={handlePause} disabled={loading}>
                  <Pause className="h-4 w-4 mr-1" />
                  Pausar
                </Button>
              ) : currentSession ? (
                <Button size="sm" variant="outline" onClick={handleResume} disabled={loading || !currentSession}>
                  <PlayCircle className="h-4 w-4 mr-1" />
                  Continuar
                </Button>
              ) : null}

              {currentSession && (
                <Button size="sm" variant="destructive" onClick={() => setShowStopDialog(true)} disabled={loading}>
                  <StopCircle className="h-4 w-4 mr-1" />
                  Parar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar Work Session</DialogTitle>
            <DialogDescription>
              Adicione um log da sessão (opcional) antes de encerrar.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder="Descreva o que foi feito nesta sessão..."
            value={logNote}
            onChange={(event) => setLogNote(event.target.value)}
            rows={5}
          />

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => handleStop(false)} disabled={submitting}>
              Encerrar sem log
            </Button>
            <Button onClick={() => handleStop(true)} disabled={submitting}>
              Encerrar com log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
