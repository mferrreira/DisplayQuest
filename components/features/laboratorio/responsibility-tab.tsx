"use client"

import { useMemo, useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Clock, Play, Square, FileText, Plus, Megaphone, Trash2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { useResponsibility } from "@/contexts/responsibility-context"
import { useLabNotices } from "@/contexts/lab-notices-context"
import { useToast } from "@/contexts/use-toast"
import { hasAccess } from "@/lib/utils/utils"
import { canManageTargetEvent } from "@/components/features/laboratorio/permissions"
import { NoticeDialog } from "@/components/features/laboratorio/notice-dialog"
import { NotesDialog } from "@/components/features/laboratorio/notes-dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

export function ResponsibilityTab() {
  const { user } = useAuth()
  const { users: labUsers } = useUser()
  const {
    responsibilities,
    activeResponsibility,
    loading,
    startResponsibility,
    endResponsibility,
    updateNotes,
  } = useResponsibility()
  const { notices, createNotice, deleteNotice } = useLabNotices()
  const canManageLab = hasAccess(user?.roles || [], "VIEW_ALL_DATA")

  const [isStarting, setIsStarting] = useState(false)
  const [isEnding, setIsEnding] = useState(false)
  const [startNotes, setStartNotes] = useState("")
  const [selectedResponsibility, setSelectedResponsibility] = useState<{ id: number; notes?: string | null } | null>(null)
  const [showNoticeDialog, setShowNoticeDialog] = useState(false)
  const [pendingDeleteNotice, setPendingDeleteNotice] = useState<{ id: number; userId: number; note: string } | null>(null)
  const { toast } = useToast()

  // Memoize formatted active responsibility start time
  const formattedActiveStartTime = useMemo(
    () => (activeResponsibility ? format(new Date(activeResponsibility.startTime), "dd/MM/yyyy HH:mm") : ""),
    [activeResponsibility],
  )

  // Memoize formatted responsibilities
  const formattedResponsibilities = useMemo(
    () =>
      responsibilities.map((responsibility) => ({
        ...responsibility,
        formattedStart: format(new Date(responsibility.startTime), "dd/MM/yyyy HH:mm"),
        formattedEnd: responsibility.endTime
          ? format(new Date(responsibility.endTime), "dd/MM/yyyy HH:mm")
          : null,
        duration: calculateDuration(responsibility.startTime, responsibility.endTime || null),
      })),
    [responsibilities],
  )

  const handleStartResponsibility = async () => {
    try {
      setIsStarting(true)
      await startResponsibility(startNotes)
      setStartNotes("")
    } catch (err) {
      console.error("Erro ao iniciar responsabilidade:", err)
      toast({
        title: "Erro",
        description: "Não foi possível iniciar a responsabilidade. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsStarting(false)
    }
  }

  const handleEndResponsibility = async () => {
    try {
      setIsEnding(true)
      await endResponsibility()
    } catch (err) {
      console.error("Erro ao encerrar responsabilidade:", err)
      toast({
        title: "Erro",
        description: "Não foi possível encerrar a responsabilidade. Tente novamente.",
        variant: "destructive",
      })
    } finally {
      setIsEnding(false)
    }
  }

  const handleUpdateNotes = async (notes: string) => {
    if (!selectedResponsibility) return
    try {
      await updateNotes(selectedResponsibility.id, notes)
      setSelectedResponsibility(null)
    } catch (err) {
      console.error("Erro ao atualizar notas:", err)
      toast({
        title: "Erro",
        description: "Não foi possível salvar as notas. Tente novamente.",
        variant: "destructive",
      })
    }
  }

  const handleSaveNotice = async (note: string) => {
    await createNotice({ note })
    setShowNoticeDialog(false)
  }

  const handleDeleteNotice = async () => {
    const notice = pendingDeleteNotice
    if (!notice || !canManageTargetEvent(user, labUsers, notice.userId)) {
      setPendingDeleteNotice(null)
      return
    }
    try {
      await deleteNotice(notice.id)
    } catch (err) {
      toast({
        title: "Erro",
        description: "Não foi possível remover o aviso.",
        variant: "destructive",
      })
    } finally {
      setPendingDeleteNotice(null)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Coluna 1: Status atual e controles */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Status Atual</CardTitle>
            <CardDescription>
              {canManageLab
                ? "Controle de responsabilidade pelo laboratório"
                : "Visualização do status do laboratório"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : activeResponsibility ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Badge variant="default">Ativo</Badge>
                  <span className="text-sm text-muted-foreground">Desde {formattedActiveStartTime}</span>
                </div>

                <div className="flex items-center justify-center">
                  <Clock className="h-5 w-5 mr-2 text-primary" />
                  <span className="text-2xl font-mono">{formatDuration(activeResponsibility.duration)}</span>
                </div>

                {canManageLab && (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleEndResponsibility}
                    disabled={isEnding}
                  >
                    {isEnding ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Square className="h-4 w-4 mr-2" />
                    )}
                    Não sou mais responsável
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center py-2">
                  <Badge variant="outline">Laboratório disponível</Badge>
                </div>

                {canManageLab ? (
                  <>
                    <Textarea
                      placeholder="Notas (opcional)"
                      value={startNotes}
                      onChange={(e) => setStartNotes(e.target.value)}
                      className="resize-none"
                      rows={3}
                    />

                    <Button variant="default" className="w-full" onClick={handleStartResponsibility} disabled={isStarting}>
                      {isStarting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Estar responsável
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    Apenas laboratoristas e coordenadores podem assumir responsabilidade pelo laboratório.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coluna 2: Quadro de Avisos */}
      <div className="md:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5" />
                  Quadro de Avisos
                </CardTitle>
                <CardDescription>
                  Avisos persistentes do laboratório. Todos os usuários podem publicar avisos; laboratoristas, gerentes e
                  coordenadores podem moderar avisos de qualquer membro.
                </CardDescription>
              </div>
              <Button onClick={() => setShowNoticeDialog(true)} size="sm" className="shrink-0">
                <Plus className="mr-2 h-4 w-4" />
                Novo aviso
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {notices.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                Nenhum aviso publicado no momento.
              </div>
            ) : (
              <div className="space-y-3">
                {notices.map((notice) => (
                  <div key={notice.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {new Date(notice.createdAt).toLocaleDateString("pt-BR")}
                          </Badge>
                          <Badge variant="secondary">
                            {new Date(notice.createdAt).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </Badge>
                          {notice.userName ? (
                            <span className="text-sm text-muted-foreground">{notice.userName}</span>
                          ) : null}
                        </div>
                        <p className="text-sm leading-6">{notice.note}</p>
                      </div>
                      {canManageTargetEvent(user, labUsers, notice.userId) ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDeleteNotice(notice)}
                          aria-label={`Remover o aviso "${notice.note}"`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histórico de responsabilidades */}
        <Card>
          <CardHeader>
            <CardTitle>Histórico de Responsabilidades</CardTitle>
            <CardDescription>
              Registro de todas as responsabilidades registradas recentemente
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : responsibilities.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                Nenhuma responsabilidade registrada neste período.
              </div>
            ) : (
              <div className="space-y-4">
                {formattedResponsibilities.map((responsibility) => (
                  <Card key={responsibility.id} className="overflow-hidden">
                    <div className="p-4 border-l-4 border-primary">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-medium">{responsibility.userName}</h3>
                          <p className="text-sm text-muted-foreground">
                            {responsibility.formattedStart}
                            {responsibility.formattedEnd ? ` até ${responsibility.formattedEnd}` : " (Em andamento)"}
                          </p>
                        </div>
                        <Badge variant={responsibility.endTime ? "secondary" : "default"}>
                          {responsibility.endTime ? "Concluído" : "Ativo"}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Duração: {responsibility.duration}</span>
                      </div>

                      {responsibility.notes && (
                        <div className="mt-2 p-2 bg-muted rounded-md">
                          <p className="text-sm">{responsibility.notes}</p>
                        </div>
                      )}

                      <div className="mt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setSelectedResponsibility({ id: responsibility.id, notes: responsibility.notes })
                          }
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          {responsibility.notes ? "Editar notas" : "Adicionar notas"}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <NoticeDialog open={showNoticeDialog} onOpenChange={setShowNoticeDialog} onSave={handleSaveNotice} />

      <ConfirmDialog
        open={Boolean(pendingDeleteNotice)}
        onOpenChange={(open) => !open && setPendingDeleteNotice(null)}
        title="Remover aviso"
        description={`Remover o aviso "${pendingDeleteNotice?.note || ""}"?`}
        confirmLabel="Remover"
        destructive
        onConfirm={handleDeleteNotice}
      />

      <NotesDialog
        open={Boolean(selectedResponsibility)}
        onOpenChange={(open) => !open && setSelectedResponsibility(null)}
        initialNotes={selectedResponsibility?.notes || ""}
        onSave={handleUpdateNotes}
      />
    </div>
  )
}

// Função para formatar duração em hh:mm:ss
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  return [hours, minutes, secs].map((value) => value.toString().padStart(2, "0")).join(":")
}

// Função para calcular a duração entre duas datas
function calculateDuration(startTime: string, endTime: string | null): string {
  const start = new Date(startTime).getTime()
  const end = endTime ? new Date(endTime).getTime() : Date.now()
  const durationInSeconds = Math.floor((end - start) / 1000)
  return formatDuration(durationInSeconds)
}
