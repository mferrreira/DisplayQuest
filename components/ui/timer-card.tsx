import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWorkSessions } from "@/contexts/work-session-context"
import { useDailyLogs } from "@/contexts/daily-log-context"
import { useAuth } from "@/contexts/auth-context"
import { Loader2, Play, StopCircle, Clock, MapPin, AlertTriangle, Info } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { UsersAPI } from "@/contexts/api-client"
import type { User } from "@/contexts/types"

interface TimerCardProps {
  onSessionEnd?: (updatedUser?: User) => void
}

export function TimerCard({ onSessionEnd }: TimerCardProps) {
  const { user } = useAuth()
  const { activeSession, startSession, endSession, loading, fetchSessions, sessions } = useWorkSessions()
  const { createLog } = useDailyLogs()
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
  const [showManualLogDialog, setShowManualLogDialog] = useState(false)
  const [manualLogNote, setManualLogNote] = useState("")
  const [selectedProjectId, setSelectedProjectId] = useState<string>("")
  const [projects, setProjects] = useState<any[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)

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
    if (activeSession && activeSession.startTime && activeSession.userId === user?.id) {
      const start = new Date(activeSession.startTime).getTime()
      setTimer(Math.floor((Date.now() - start) / 1000))
      if (!timerInterval) {
        const interval = setInterval(() => {
          setTimer(Math.floor((Date.now() - start) / 1000))
        }, 1000)
        setTimerInterval(interval)
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
  }, [activeSession, user?.id])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeSession) {
        e.preventDefault()
        e.returnValue = "Você tem uma sessão ativa. Tem certeza que deseja sair?"
        return "Você tem uma sessão ativa. Tem certeza que deseja sair?"
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [activeSession])


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
    if (!activeSession) return
    
    const startTime = new Date(activeSession.startTime).getTime()
    const currentDuration = Math.floor((Date.now() - startTime) / 1000)
    setSessionDuration(currentDuration)
    setShowLogDialog(true)
  }

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !activeSession) return
    
    setSubmittingLog(true)
    try {
      await endSession(activeSession.id, activity)
      
      if (logNote.trim()) {
        const today = new Date().toISOString().split("T")[0]
        await createLog({
          userId: user.id,
          date: today,
          note: logNote.trim()
        })
      }
      
      setShowLogDialog(false)
      setLogNote("")
      setSessionDuration(0)
      setPendingSessionEnd(false)
      setTimer(0)
      
      if (onSessionEnd) onSessionEnd()
      await fetchSessions(user?.id)
    } catch (err) {
      console.error("Erro ao finalizar sessão:", err)
      setError("Erro ao finalizar sessão")
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
    if (!user || !activeSession) return
    
    setSubmittingLog(true)
    try {
      await endSession(activeSession.id, activity)
      
      setShowLogDialog(false)
      setLogNote("")
      setSessionDuration(0)
      setPendingSessionEnd(false)
      setTimer(0)
      
      if (onSessionEnd) onSessionEnd()
      await fetchSessions(user?.id)
    } catch (err) {
      console.error("Erro ao finalizar sessão:", err)
      setError("Erro ao finalizar sessão")
    } finally {
      setSubmittingLog(false)
    }
  }

  const handleManualLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !manualLogNote.trim()) return
    
    setSubmittingLog(true)
    try {
      const today = new Date().toISOString().split("T")[0]
      await createLog({
        userId: user.id,
        date: today,
        note: manualLogNote.trim()
      })
      
      setShowManualLogDialog(false)
      setManualLogNote("")
    } catch (err) {
      console.error("Erro ao criar log:", err)
      setError("Erro ao criar log")
    } finally {
      setSubmittingLog(false)
    }
  }

  const handleManualLogCancel = () => {
    setShowManualLogDialog(false)
    setManualLogNote("")
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
          {activeSession && activeSession.userId === user?.id ? (
            <div className="flex flex-col items-start space-y-4 w-full">
              <div className="text-3xl font-mono text-blue-900 font-bold">
                {formatTime(timer)}
              </div>
              
              <div className="w-full space-y-2">
                <div className="flex items-center space-x-2 text-sm text-gray-700">
                  <Clock className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Atividade:</span> 
                  <span>{activeSession.activity || "Trabalho geral"}</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-700">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">Local:</span> 
                  <span>{activeSession.location || "Não especificado"}</span>
                </div>
              </div>
              
              <Button
                variant="destructive"
                className="mt-4 w-full h-12 text-lg font-bold bg-red-600 hover:bg-red-700"
                onClick={handleEndRequest}
                disabled={loading}
              >
                <StopCircle className="h-5 w-5 mr-2" />
                Encerrar Sessão
              </Button>
              
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
          
          {/* Add Log Button when no active session */}
          {!activeSession && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => setShowManualLogDialog(true)}
                className="w-full border-green-300 text-green-700 hover:bg-green-50"
              >
                <Clock className="h-4 w-4 mr-2" />
                Adicionar Log Manual
              </Button>
            </div>
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

      {/* Manual Log Dialog */}
      <Dialog open={showManualLogDialog} onOpenChange={setShowManualLogDialog}>
        <DialogContent className="sm:max-w-xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-green-600" />
              <span>Adicionar Log Manual</span>
            </DialogTitle>
            <DialogDescription>
              Registre uma atividade realizada sem usar o timer de trabalho.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleManualLogSubmit} className="flex-1 flex flex-col space-y-4 min-h-0">
            <div className="flex-1 space-y-2 min-h-0">
              <label htmlFor="manualLogNote" className="text-sm font-medium text-gray-700">
                Descrição da atividade
              </label>
              <Textarea
                id="manualLogNote"
                placeholder="Descreva as tarefas realizadas, projetos trabalhados, ou atividades desenvolvidas..."
                value={manualLogNote}
                onChange={(e) => setManualLogNote(e.target.value)}
                className="min-h-[120px] max-h-[200px] border-green-300 focus:border-green-500 resize-none"
                autoFocus
                required
              />
            </div>
            
            <Alert className="flex-shrink-0">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Este log será adicionado aos seus registros diários e incluído no relatório semanal.
              </AlertDescription>
            </Alert>
            
            <DialogFooter className="flex-shrink-0 flex flex-col sm:flex-row gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleManualLogCancel}
                disabled={submittingLog}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={submittingLog || !manualLogNote.trim()}
                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
              >
                {submittingLog ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Adicionar Log"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
} 