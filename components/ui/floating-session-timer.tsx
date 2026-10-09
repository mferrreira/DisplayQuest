"use client"

import { useEffect, useRef, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useWorkSessions } from "@/hooks/use-work-sessions"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Pause, PlayCircle, StopCircle, ChevronDown } from "lucide-react"
import { useProject } from "@/contexts/project-context"
import { getNextScheduledPause, getMissedScheduledPause, toSafeDate } from "@/lib/work-sessions/schedule"
import { SessionAutoPauseCountdown } from "@/components/ui/session-auto-pause-countdown"
import { SessionWelcomeBalloon } from "@/components/ui/session-welcome-balloon"
import { SessionNotesDraft, useSessionNotes } from "@/components/ui/session-notes-draft"
import {
  SessionAlertSoundToggle,
  SessionTimerIndicator,
  sessionTimerButtonLabel,
  useSessionAlertSound,
  type SessionTimerVisualState,
} from "@/components/ui/session-alert"
import { ResponsibilityMiniPanel } from "@/components/ui/responsibility-mini-panel"
import { ResponsibilitiesAPI } from "@/contexts/api-client"

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
  const [stopError, setStopError] = useState<string | null>(null)
  const [startProjectId, setStartProjectId] = useState("")
  const [startActivity, setStartActivity] = useState("")
  const [startLocation, setStartLocation] = useState("")
  const [startError, setStartError] = useState<string | null>(null)
  const autoPausedSessionIdsRef = useRef<Set<number>>(new Set())
  // OND2-C: o pulso do botão fechado vive enquanto ninguém retomou nem encerrou. Some
  // sozinho ao abrir o painel (`expanded`), porque aí a pessoa já viu o aviso.
  const [autoPausedNotice, setAutoPausedNotice] = useState(false)

  const {
    enabled: soundEnabled,
    setEnabled: setSoundEnabled,
    playPauseSound,
    supported: soundSupported,
    loaded: soundLoaded,
  } = useSessionAlertSound()

  // OND2-B: rascunho de anotações preso a ESTA sessão (chave inclui o id). Vive aqui porque
  // quem precisa do texto no momento de encerrar é o próprio cronômetro — o despejo no log.
  const {
    note: sessionNote,
    setNote: setSessionNote,
    clearNote: clearSessionNote,
  } = useSessionNotes(currentSession?.id ?? null)

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
          try {
            // Intentional coupling (business rule): at the key pause hours
            // (09:30/12:00/15:00/17:00) BOTH the session and the lab
            // responsibility pause. Manual session controls must NOT do this.
            await ResponsibilitiesAPI.pause()
          } catch {
            // Responsibility pause is secondary; session pause succeeded.
          }
          setShowAutoPauseDialog(true)
          // OND2-C: o alerta é disparado aqui, e não quando a pessoa abre o painel — o
          // diálogo modal não é visto com a aba em segundo plano, que é o caso comum de
          // quem deixa a sessão correndo.
          setAutoPausedNotice(true)
          playPauseSound()
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
    // `playPauseSound` entra na lista porque a preferência do som é lida dentro de
    // `doAutoPause`: sem isto, o closure seria o da montagem, com o som ainda desligado.
    // O efeito só rearma o timer com o próximo horário — o que o toggle não muda.
  }, [
    currentSession?.id,
    currentSession?.status,
    currentSession?.startTime,
    user?.id,
    pauseSession,
    fetchSessions,
    playPauseSound,
  ])

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

  // Manual session controls act on the session ONLY. The lab responsibility
  // is an independent counter with its own state (see ResponsibilityMiniPanel
  // Pausar/Continuar): pausing/resuming here must not touch it. The only
  // session→responsibility coupling is the scheduled key-hour auto-pause
  // (doAutoPause above), which pauses both by business rule.
  const handlePause = async () => {
    if (!activeSession || !user?.id) return
    await pauseSession(activeSession.id)
    await fetchSessions(user.id)
    // OND2-C: pausa manual também avisa. Quem parou por decisão própria já está olhando a
    // tela, mas quem parou e depois foi para outra aba não está.
    playPauseSound()
  }

  const handleResume = async () => {
    if (!currentSession || currentSession.status !== "paused" || !user?.id) return
    await resumeSession(currentSession.id)
    await fetchSessions(user.id)
    setShowAutoPauseDialog(false)
    setAutoPausedNotice(false)
  }

  /**
   * OND2-B: abrir "Finalizar Work Session" despeja o rascunho na caixa de log, que segue
   * editável — o rascunho evita redigitar, não decide o texto final. Os dois caminhos de
   * entrada (botão Parar e o "Encerrar sessão" da pausa automática) passam por aqui.
   */
  const openStopDialog = () => {
    setLogNote(sessionNote)
    setStopError(null)
    setShowStopDialog(true)
  }

  const handleStop = async () => {
    if (!currentSession || !user?.id) return
    const note = logNote.trim()
    if (!note) return
    setSubmitting(true)
    setStopError(null)
    try {
      await endSession(currentSession.id, currentSession.activity || undefined, {
        dailyLogNote: note,
      })
      // Só agora o rascunho sai: encerrar com sucesso é o que libera a chave da sessão.
      clearSessionNote()
      setShowStopDialog(false)
      setShowAutoPauseDialog(false)
      setAutoPausedNotice(false)
      setLogNote("")
      await fetchSessions(user.id)
    } catch {
      // Falhou: a sessão continua aberta, então nada pode ser descartado. O texto editado
      // no diálogo volta para o rascunho (é ele o que sobrevive a recarga) e o erro fica
      // visível — antes disso a falha era um rejection silencioso no console.
      setSessionNote(note)
      setStopError("Não foi possível encerrar a sessão. Sua anotação foi mantida — tente de novo.")
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

  // OND2-C: o que o botão fechado mostra. "auto-paused" (pulso) vale enquanto ninguém
  // retomou, encerrou ou abriu o painel — abrir o painel já é ter visto o aviso.
  const collapsedState: SessionTimerVisualState =
    !currentSession
      ? "none"
      : currentSession.status === "paused"
        ? autoPausedNotice && !expanded
          ? "auto-paused"
          : "paused"
        : "active"

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
            aria-label={sessionTimerButtonLabel(collapsedState)}
            data-testid="floating-session-timer-collapsed"
          >
            <SessionTimerIndicator state={collapsedState} />
          </Button>
        ) : (
          <Tabs defaultValue="sessao" className="space-y-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sessao">Sessão</TabsTrigger>
              <TabsTrigger value="responsabilidade">Responsabilidade</TabsTrigger>
            </TabsList>

            <TabsContent value="sessao" className="space-y-3 mt-0">
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

            {currentSession && (
              <SessionNotesDraft
                sessionId={currentSession.id}
                note={sessionNote}
                onNoteChange={setSessionNote}
              />
            )}

            {/* OND2-C: o aviso sonoro é por sessão aberta — sem sessão não há pausa para
                avisar, e o interruptor ficaria num painel que não faz sentido. */}
            {currentSession && (
              <SessionAlertSoundToggle
                enabled={soundEnabled}
                onChange={setSoundEnabled}
                supported={soundSupported}
                loaded={soundLoaded}
              />
            )}

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
                <Button size="sm" variant="destructive" onClick={openStopDialog} disabled={loading}>
                  <StopCircle className="h-4 w-4 mr-1" />
                  Parar
                </Button>
              )}

              <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
            </TabsContent>

            <TabsContent value="responsabilidade" className="mt-0">
              <ResponsibilityMiniPanel />
              <div className="mt-2 flex justify-end">
                <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      <Dialog open={showStopDialog} onOpenChange={setShowStopDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Finalizar Work Session</DialogTitle>
            <DialogDescription>
              Escreva um log da sessão antes de encerrar — ele é obrigatório.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            placeholder="Descreva o que foi feito nesta sessão..."
            value={logNote}
            onChange={(event) => setLogNote(event.target.value)}
            rows={5}
          />
          {!logNote.trim() && (
            <p className="text-xs text-muted-foreground">
              O log é obrigatório para encerrar a sessão.
            </p>
          )}
          {stopError && (
            <p role="alert" className="text-xs text-destructive">
              {stopError}
            </p>
          )}

          <DialogFooter className="gap-2">
            <Button onClick={() => handleStop()} disabled={submitting || !logNote.trim()}>
              Encerrar sessão
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
                openStopDialog()
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
