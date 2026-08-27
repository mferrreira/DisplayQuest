"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useWorkSessions } from "@/hooks/use-work-sessions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Clock, Pause, PlayCircle, StopCircle, ChevronDown } from "lucide-react"
import { useProject } from "@/contexts/project-context"
import { getNextScheduledPause, getMissedScheduledPause, toSafeDate } from "@/lib/work-sessions/schedule"
import { SessionAutoPauseCountdown } from "@/components/ui/session-auto-pause-countdown"
import { SessionWelcomeBalloon } from "@/components/ui/session-welcome-balloon"

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((value) => value.toString().padStart(2, "0")).join(":")
}

export function FloatingSessionTimer() {
  const { user, loading: authLoading } = useAuth()
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
  const panelRef = useRef<HTMLDivElement | null>(null)

  const [expanded, setExpanded] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [showStopDialog, setShowStopDialog] = useState(false)
  const [showAutoPauseDialog, setShowAutoPauseDialog] = useState(false)
  const [logNote, setLogNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [startProjectId, setStartProjectId] = useState("")
  const [startActivity, setStartActivity] = useState("")
  const [startLocation, setStartLocation] = useState("")
  const [startError, setStartError] = useState<string | null>(null)
  const autoPausedSessionIdsRef = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (!user?.id) return

    void fetchSessions(user.id)
    const interval = setInterval(() => {
      void fetchSessions(user.id)
    }, 30000)

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

  // Scheduled auto-pause (client-side, in sync with the server cron): while a
  // session is active, the next pause boundary (09:30/12:00/15:00/17:00,
  // America/Sao_Paulo) is a fixed wall-clock instant, so wait for it with a
  // single timeout instead of re-running timezone schedule math every second
  // (that per-second Intl work saturated the main thread in Firefox). The
  // effect re-runs only when the session identity/state changes (the 30s poll
  // included) or the pause callback changes. Server-side normalization (cron
  // + list/get endpoints) remains the authoritative safety net for idle tabs
  // and other clients.
  useEffect(() => {
    if (!currentSession?.id || currentSession.status !== "active" || !currentSession.startTime || !user?.id) return

    const sessionId = currentSession.id
    const start = toSafeDate(currentSession.startTime)
    const now = new Date()

    const doAutoPause = () => {
      if (autoPausedSessionIdsRef.current.has(sessionId)) return
      autoPausedSessionIdsRef.current.add(sessionId)
      void (async () => {
        try {
          await pauseSession(sessionId)
          await fetchSessions(user.id)
          setShowAutoPauseDialog(true)
        } catch {
          // Allow a later poll to retry if the pause request failed.
          autoPausedSessionIdsRef.current.delete(sessionId)
        }
      })()
    }

    // A pause was crossed while the tab was asleep or backgrounded: pause now.
    if (getMissedScheduledPause(start, now)) {
      doAutoPause()
      return
    }

    const nextPause = getNextScheduledPause(now)
    const delay = Math.max(0, nextPause.getTime() - now.getTime())
    const timeout = setTimeout(doAutoPause, delay)
    return () => clearTimeout(timeout)
  }, [currentSession?.id, currentSession?.status, currentSession?.startTime, user?.id, pauseSession, fetchSessions])

  useEffect(() => {
    if (!expanded) return
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (!panelRef.current) return
      if (panelRef.current.contains(target)) return
      if (target.closest("[data-floating-timer-select-content='true']")) return
      if (target.closest("[data-radix-popper-content-wrapper]")) return
      setExpanded(false)
    }

    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [expanded])

  useEffect(() => {
    const openHandler = () => setExpanded(true)
    window.addEventListener("floating-session-timer:open", openHandler as EventListener)
    return () => window.removeEventListener("floating-session-timer:open", openHandler as EventListener)
  }, [])

  const handlePause = async () => {
    if (!activeSession || !user?.id) return
    await pauseSession(activeSession.id)
    await fetchSessions(user.id)
  }

  const handleResume = async () => {
    if (!currentSession || currentSession.status !== "paused" || !user?.id) return
    await resumeSession(currentSession.id)
    await fetchSessions(user.id)
    setShowAutoPauseDialog(false)
  }

  const handleStop = async (withLog: boolean) => {
    if (!currentSession || !user?.id) return
    setSubmitting(true)
    try {
      await endSession(currentSession.id, currentSession.activity || undefined, {
        dailyLogNote: withLog && logNote.trim() ? logNote.trim() : undefined,
      })
      setShowStopDialog(false)
      setShowAutoPauseDialog(false)
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
        ref={panelRef}
        className={`fixed bottom-[6em] left-[6em] z-50 rounded-lg border bg-background/95 shadow-lg backdrop-blur transition-all duration-200 ${
          expanded ? "w-80 p-4" : "w-16 h-16 p-0"
        }`}
      >
        <SessionWelcomeBalloon
          isLoggedIn={Boolean(user)}
          hasNoSession={!currentSession}
          onStartSession={() => setExpanded(true)}
        />
        {!expanded ? (
          <Button
            variant="ghost"
            className="w-full h-full rounded-lg flex items-center justify-center"
            onClick={() => setExpanded(true)}
            aria-label="Abrir timer de sessão"
          >
            <Clock className="h-5 w-5" />
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Sessão de Trabalho</p>
              <span className="text-xs text-muted-foreground">
                {!user && authLoading
                  ? "Carregando..."
                  : !currentSession
                  ? "Sem sessão"
                  : currentSession.status === "paused"
                    ? "Pausada"
                    : "Ativa"}
              </span>
            </div>

            <p className="font-mono text-2xl font-bold">{formatTime(seconds)}</p>

            <SessionAutoPauseCountdown
              sessionStatus={currentSession?.status ?? null}
              startTime={currentSession?.startTime ?? null}
            />

            {!currentSession && user && (
              <div className="space-y-2">
                <Select value={startProjectId} onValueChange={setStartProjectId}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Projeto" />
                  </SelectTrigger>
                  <SelectContent data-floating-timer-select-content="true">
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
                {startError && <p className="text-xs text-red-600 dark:text-red-400">{startError}</p>}
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

              <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:overflow-y-auto">
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

      <Dialog open={showAutoPauseDialog} onOpenChange={setShowAutoPauseDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sessão pausada automaticamente</DialogTitle>
            <DialogDescription>
              A work session ficou ativa por muito tempo e foi pausada automaticamente. Você pode continuar de onde parou ou encerrar a sessão.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowAutoPauseDialog(false)
                setShowStopDialog(true)
              }}
            >
              Encerrar sessão
            </Button>
            <Button onClick={handleResume} disabled={loading || !currentSession}>
              Continuar sessão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
