import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWorkSessions } from "@/hooks/use-work-sessions"
import { useAuth } from "@/contexts/auth-context"
import { Loader2, Play, StopCircle, Clock, MapPin, AlertTriangle, Pause, PlayCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { User } from "@/contexts/types"

interface TimerCardProps {
  onSessionEnd?: (updatedUser?: User) => void
}

export function TimerCard({ onSessionEnd }: TimerCardProps) {
  const { user } = useAuth()
  const {
    activeSession,
    currentSession,
    startSession,
    endSession,
    pauseSession,
    resumeSession,
    loading,
    fetchSessions,
    getElapsedSeconds,
  } = useWorkSessions()
  const [activity, setActivity] = useState("")
  const [location, setLocation] = useState("")
  const [timer, setTimer] = useState(0)
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLogDialog, setShowLogDialog] = useState(false)
  const [logNote, setLogNote] = useState("")
  const [submittingLog, setSubmittingLog] = useState(false)
  const [sessionDuration, setSessionDuration] = useState(0)
  const [pendingSessionEnd, setPendingSessionEnd] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [projects, setProjects] = useState<any[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)

  const verifyIfSessionWasClosed = async (sessionId: number) => {
    try {
      const response = await fetch("/api/work-sessions?active=true")
      const payload = await response.json()
      const activeSessions = Array.isArray(payload?.data) ? payload.data : []
      return !activeSessions.some((session: any) => session.id === sessionId)
    } catch {
      return false
    }
  }

  useEffect(() => {
    if (user) fetchSessions(user.id)
  }, [user])

  useEffect(() => {
    const fetchProjects = async () => {
      if (!user) return
      
      setLoadingProjects(true)
      try {
        const response = await fetch('/api/projects')
        const data = await response.json()
        if (data.projects) {
          setProjects(data.projects)
        }
      } catch (error) {
        console.error('Erro ao buscar projetos:', error)
      } finally {
        setLoadingProjects(false)
      }
    }

    fetchProjects()
  }, [user])

  useEffect(() => {
    if (currentSession && currentSession.userId === user?.id) {
      setTimer(getElapsedSeconds(currentSession))
      if (currentSession.status === "active" && !timerInterval) {
        const interval = setInterval(() => {
          setTimer(getElapsedSeconds(currentSession))
        }, 1000)
        setTimerInterval(interval)
      }

      if (currentSession.status !== "active" && timerInterval) {
        clearInterval(timerInterval)
        setTimerInterval(null)
      }
    } else {
      setTimer(0)
      if (timerInterval) {
        clearInterval(timerInterval)
        setTimerInterval(null)
      }
    }

    return () => {
      if (timerInterval) {
        clearInterval(timerInterval)
        setTimerInterval(null)
      }
    }
  }, [currentSession, user?.id, getElapsedSeconds])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (currentSession) {
        e.preventDefault()
        e.returnValue = "Você tem uma sessão ativa. Tem certeza que deseja sair?"
        return "Você tem uma sessão ativa. Tem certeza que deseja sair?"
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentSession])


  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    const isCoordinatorOrManager = user?.roles?.includes('COORDENADOR') || user?.roles?.includes('GERENTE')
    
    if ((!selectedProjectId || selectedProjectId === "loading" || selectedProjectId === "no-projects") && !isCoordinatorOrManager) {
      setError("Por favor, selecione um projeto antes de iniciar a sessão")
      return
    }
    
    try {
      if (!user) throw new Error("Usuário não autenticado")
      
      const projectId = selectedProjectId && selectedProjectId !== "no-project" ? parseInt(selectedProjectId) : undefined
      
      await startSession({ userId: user.id, activity, location, projectId })
      setActivity("")
      setLocation("")
      setSelectedProjectId("")
      await fetchSessions(user.id)
    } catch (err: any) {
      setError(err.message || "Erro ao iniciar sessão")
      await fetchSessions(user?.id)
    }
  }

  const handleEndRequest = () => {
    if (!currentSession) return
    const currentDuration = getElapsedSeconds(currentSession)
    setSessionDuration(currentDuration)
    setShowLogDialog(true)
  }

  const handlePause = async () => {
    if (!activeSession) return
    try {
      await pauseSession(activeSession.id)
      await fetchSessions(user?.id)
    } catch (err: any) {
      setError(err?.message || "Erro ao pausar sessão")
    }
  }

  const handleResume = async () => {
    if (!currentSession || currentSession.status !== "paused") return
    try {
      await resumeSession(currentSession.id)
      await fetchSessions(user?.id)
    } catch (err: any) {
      setError(err?.message || "Erro ao retomar sessão")
    }
  }

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !currentSession) return
    
    setSubmittingLog(true)
    try {
      await endSession(currentSession.id, activity, {
        dailyLogNote: logNote.trim() ? logNote.trim() : undefined,
      })
      
      setShowLogDialog(false)
      setLogNote("")
      setSessionDuration(0)
      setPendingSessionEnd(false)
      setTimer(0)
      
      if (onSessionEnd) onSessionEnd()
      await fetchSessions(user?.id)
    } catch (err: any) {
      console.error("Erro ao finalizar sessão:", err)
      const closed = await verifyIfSessionWasClosed(currentSession.id)
      if (closed) {
        setShowLogDialog(false)
        setLogNote("")
        setSessionDuration(0)
        setPendingSessionEnd(false)
        setTimer(0)
        if (onSessionEnd) onSessionEnd()
        await fetchSessions(user?.id)
        return
      }
      setError(err?.message || "Erro ao finalizar sessão")
    } finally {
      setSubmittingLog(false)
    }
  }

  const handleLogCancel = () => {
    setShowLogDialog(false)
    setLogNote("")
    setSessionDuration(0)
    setPendingSessionEnd(false)
  }

  const handleEndWithoutLog = async () => {
    if (!user || !currentSession) return
    
    setSubmittingLog(true)
    try {
      await endSession(currentSession.id, activity)
      
      setShowLogDialog(false)
      setLogNote("")
      setSessionDuration(0)
      setPendingSessionEnd(false)
      setTimer(0)
      
      if (onSessionEnd) onSessionEnd()
      await fetchSessions(user?.id)
    } catch (err: any) {
      console.error("Erro ao finalizar sessão:", err)
      const closed = await verifyIfSessionWasClosed(currentSession.id)
      if (closed) {
        setShowLogDialog(false)
        setLogNote("")
        setSessionDuration(0)
        setPendingSessionEnd(false)
        setTimer(0)
        if (onSessionEnd) onSessionEnd()
        await fetchSessions(user?.id)
        return
      }
      setError(err?.message || "Erro ao finalizar sessão")
    } finally {
      setSubmittingLog(false)
    }
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return [h, m, s]
      .map((v) => v.toString().padStart(2, "0"))
      .join(":")
  }

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) {
      return `${h}h ${m}min`
    }
    return `${m}min`
  }

  return (
    <>
      <Card className="mb-4 border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <span>Timer de Atividade</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {currentSession && currentSession.userId === user?.id ? (
            <div className="flex flex-col items-start space-y-4 w-full">
              <div className="text-3xl font-mono text-blue-900 font-bold">
                {formatTime(timer)}
              </div>
              
              <div className="w-full space-y-2">
                <div className="flex items-center space-x-2 text-sm text-gray-700">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Atividade:</span> 
                  <span>{currentSession.activity || "Trabalho geral"}</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-700">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Local:</span> 
                  <span>{currentSession.location || "Não especificado"}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Status: {currentSession.status === "paused" ? "Pausada" : "Em andamento"}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 w-full">
                {currentSession.status === "active" ? (
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={handlePause}
                    disabled={loading}
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Pausar
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="h-10"
                    onClick={handleResume}
                    disabled={loading}
                  >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Continuar
                  </Button>
                )}
                <Button
                  variant="destructive"
                  className="h-10 text-lg font-bold bg-red-600 hover:bg-red-700"
                  onClick={handleEndRequest}
                  disabled={loading}
                >
                  <StopCircle className="h-5 w-5 mr-2" />
                  Encerrar
                </Button>
              </div>
              
              {error && (
                <div className="text-red-500 text-sm mt-2 p-2 bg-red-50 rounded">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <form className="flex flex-col space-y-3" onSubmit={handleStart}>
              <div className="space-y-2">
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId} disabled={loading}>
                  <SelectTrigger className="border-blue-300 focus:border-blue-500">
                    <SelectValue placeholder={
                      user?.roles?.includes('COORDENADOR') || user?.roles?.includes('GERENTE') 
                        ? "Selecione um projeto (opcional)" 
                        : "Selecione um projeto *"
                    } />
                  </SelectTrigger>
                  <SelectContent>
                    {loadingProjects ? (
                      <SelectItem value="loading" disabled>Carregando projetos...</SelectItem>
                    ) : (
                      <>
                        {/* Opção para coordenadores/gerentes */}
                        {(user?.roles?.includes('COORDENADOR') || user?.roles?.includes('GERENTE')) && (
                          <SelectItem value="no-project">Sem projeto específico</SelectItem>
                        )}
                        {/* Projetos disponíveis */}
                        {projects.length === 0 ? (
                          <SelectItem value="no-projects" disabled>Nenhum projeto disponível</SelectItem>
                        ) : (
                          projects.map((project) => (
                            <SelectItem key={project.id} value={project.id.toString()}>
                              {project.name}
                            </SelectItem>
                          ))
                        )}
                      </>
                    )}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Descreva a atividade (opcional)"
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  disabled={loading}
                  className="border-blue-300 focus:border-blue-500"
                />
                <Input
                  placeholder="Local (lab, home, remoto...)"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={loading}
                  className="border-blue-300 focus:border-blue-500"
                />
              </div>
              
              <Button 
                type="submit" 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Play className="h-4 w-4 mr-2" />
                Iniciar Sessão
                {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              </Button>
              
              {error && (
                <div className="text-red-500 text-sm mt-2 p-2 bg-red-50 rounded">
                  {error}
                </div>
              )}
            </form>
          )}
          
        </CardContent>
      </Card>

      {/* Activity Log Dialog */}
      <Dialog open={showLogDialog} onOpenChange={setShowLogDialog}>
        <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <span>Registrar Atividade</span>
            </DialogTitle>
            <DialogDescription>
              Sessão com duração de <strong>{formatDuration(sessionDuration)}</strong>. 
              Descreva o que você realizou durante este período.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleLogSubmit} className="flex-1 flex flex-col space-y-4 min-h-0">
            <div className="flex-1 space-y-2 min-h-0">
              <label htmlFor="logNote" className="text-sm font-medium text-gray-700">
                Descrição da atividade (opcional)
              </label>
              <Textarea
                id="logNote"
                placeholder="Descreva as tarefas realizadas, projetos trabalhados, ou atividades desenvolvidas..."
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                className="min-h-[120px] max-h-[200px] border-blue-300 focus:border-blue-500 resize-none"
                autoFocus
              />
            </div>
            
            <Alert className="flex-shrink-0">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Opções disponíveis:</strong><br/>
                • <strong>Salvar e Encerrar:</strong> Cria um log e finaliza a sessão<br/>
                • <strong>Encerrar Sem Log:</strong> Finaliza a sessão sem criar log<br/>
                • <strong>Cancelar:</strong> Mantém a sessão ativa
              </AlertDescription>
            </Alert>
            
            <DialogFooter className="flex-shrink-0 flex flex-col sm:flex-row gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleLogCancel}
                disabled={submittingLog}
                className="w-full sm:w-auto"
              >
                Cancelar (Manter Ativa)
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleEndWithoutLog}
                disabled={submittingLog}
                className="w-full sm:w-auto"
              >
                Encerrar Sem Log
              </Button>
              <Button
                type="submit"
                disabled={submittingLog}
                className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
              >
                {submittingLog ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar e Encerrar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </>
  )
} 
