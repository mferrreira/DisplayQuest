"use client"

/**
 * ActivityCompletionDialog — o fluxo de concluir uma linha do cronograma (V5-7a, DEC-76/157/162).
 *
 * É a tela da fase 1 das duas fases: anexar provas e SOLICITAR a conclusão (OPEN →
 * COMPLETION_REQUESTED). A aprovação é outra pessoa, em outro batch (V5-7b, DEC-77), e esta
 * tela não oferece nada dela.
 *
 * A tela não monta regra: as frases de recusa (trava DEC-99, prova ausente DEC-162, 409 de
 * status) vêm do servidor, que as lê do domínio — e a dica fixa na tela é a MESMA constante
 * `ACTIVITY_NO_PROOF_MESSAGE` que o use case e o mock de teste usam (DEC-90: frase em duas
 * cópias é frase mentindo em uma delas). O botão aparece por `canRequest`, decisão calculada
 * pela mesma função do domínio que o servidor usa (DEC-92); o 403 que chegar mesmo assim é
 * tratado como erro, não como botão desabilitado.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, Loader2, Paperclip, Trash2 } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { ACTIVITY_NO_PROOF_MESSAGE, ACTIVITY_STATUS_LABELS, type ActivityStatus } from "@/backend/domain"
import { formatAttachmentSize } from "@/lib/api/project-files"
import {
  approveActivityCompletion,
  deleteActivityProof,
  listActivityProofs,
  requestActivityCompletion,
  uploadActivityProof,
  type ActivityProof,
  type ProjectActivity,
} from "@/lib/api/project-cronograma"
import type { CronogramaActivityRow, CronogramaMemberOption } from "@/components/features/cronograma-editor"

/** Mesma allowlist do seam de upload, traduzida — o `accept` do campo (medido no V5-2d: o
 *  input descarta em silêncio o que não está aqui; a recusa do servidor é outra camada). */
const PROOF_ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime"

function statusLabelOf(status: string | undefined): string {
  return ACTIVITY_STATUS_LABELS[(status ?? "OPEN") as ActivityStatus] ?? status ?? ""
}

/** `requestedAt`/`uploadedAt` são instantâneos (DateTime), não data civil — formatar com
 *  `new Date` é o caminho certo aqui; o erro da DEC-132 é formatar `YYYY-MM-DD` assim. */
function dateOf(instant: string): string {
  return new Date(instant).toLocaleDateString("pt-BR")
}

interface ActivityCompletionDialogProps {
  projectId: number
  activity: CronogramaActivityRow
  members: CronogramaMemberOption[]
  canRequest: boolean
  /** V5-7b (DEC-76/77): global manager que pode aprovar ESTA linha (auto-aprovação já resolvida). */
  canApprove: boolean
  onOpenChange: (open: boolean) => void
  /** A atividade volta do servidor já na fase nova; o painel escreve no lugar da linha. */
  onRequested: (activity: ProjectActivity) => void
}

export function ActivityCompletionDialog({
  projectId,
  activity,
  members,
  canRequest,
  canApprove,
  onOpenChange,
  onRequested,
}: ActivityCompletionDialogProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [proofs, setProofs] = useState<ActivityProof[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const activityId = activity.id ?? 0

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setProofs(await listActivityProofs(projectId, activityId))
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao carregar as provas",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, activityId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) return

    setBusy(true)
    try {
      const proof = await uploadActivityProof(projectId, activityId, file)
      setProofs((current) => [proof, ...current])
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao enviar a prova",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (proof: ActivityProof) => {
    setBusy(true)
    try {
      await deleteActivityProof(projectId, activityId, proof.id)
      setProofs((current) => current.filter((item) => item.id !== proof.id))
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao excluir a prova",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const handleRequest = async () => {
    setBusy(true)
    try {
      const updated = await requestActivityCompletion(projectId, activityId)
      onRequested(updated)
      // O diálogo fecha: a linha da grade já mostra o estado novo ("Conclusão solicitada"), e
      // reabrir mostra o histórico. Manter os dois abertos duplicaria a mesma frase no DOM.
      onOpenChange(false)
      toast({
        title: "Solicitação registrada",
        description: "A aprovação é do coordenador ou gerente do sistema.",
      })
    } catch (error) {
      // A recusa chega com a frase do domínio (trava DEC-99, prova ausente DEC-162, 409 de
      // status) — a tela repete a frase do servidor, não inventa a sua (DEC-90).
      toast({
        title: "Ação não permitida",
        description: error instanceof Error ? error.message : "Falha ao solicitar a conclusão",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const status = activity.status ?? "OPEN"
  const requestable = status === "OPEN"
  const approvable = status === "COMPLETION_REQUESTED"
  const requestedByName =
    activity.requestedBy !== null && activity.requestedBy !== undefined
      ? members.find((member) => member.id === activity.requestedBy)?.name
      : undefined

  const handleApprove = async () => {
    setBusy(true)
    try {
      const result = await approveActivityCompletion(projectId, activityId)
      onRequested(result.activity)
      onOpenChange(false)
      // A tela mostra o número do servidor (R7): o prêmio distribuído, não um cálculo local.
      toast({
        title: "Atividade concluída",
        description:
          result.award > 0
            // V8-5 (DEC-215): o prêmio distribuído é moeda, não ponto do mês.
            ? `${result.award} moedas distribuídas entre os membros do projeto.`
            : "Nenhuma moeda distribuída — prêmio zerado pelo atraso (piso 0).",
      })
    } catch (error) {
      toast({
        title: "Ação não permitida",
        description: error instanceof Error ? error.message : "Falha ao aprovar a conclusão",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Conclusão da atividade {activity.order}</DialogTitle>
          <DialogDescription>{activity.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{statusLabelOf(status)}</Badge>
            {activity.requestedAt ? (
              <p className="text-xs text-muted-foreground">
                Solicitada em {dateOf(activity.requestedAt)}
                {requestedByName ? ` por ${requestedByName}` : ""}
              </p>
            ) : null}
          </div>

          <section className="grid gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Provas</p>
              {canRequest && requestable ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={PROOF_ACCEPT}
                    aria-label="Arquivo de prova"
                    className="max-w-[220px] text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleUpload()}
                  >
                    <Paperclip className="mr-1 h-4 w-4" />
                    Anexar prova
                  </Button>
                </div>
              ) : null}
            </div>

            {loading ? (
              <p className="text-sm text-muted-foreground">
                <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
                Carregando provas…
              </p>
            ) : proofs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma prova anexada.</p>
            ) : (
              <ul className="grid gap-2">
                {proofs.map((proof) => (
                  <li key={proof.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Paperclip className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={`/api/projects/${projectId}/activities/${activityId}/files/${proof.id}/file`}
                        className="underline"
                      >
                        {proof.name}
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {formatAttachmentSize(proof.size)} — {dateOf(proof.uploadedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Baixar prova ${proof.name}`}
                        onClick={() => {
                          window.open(
                            `/api/projects/${projectId}/activities/${activityId}/files/${proof.id}/file`,
                            "_blank",
                            "noopener",
                          )
                        }}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {canRequest ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Apagar prova ${proof.name}`}
                          disabled={busy}
                          onClick={() => void handleDelete(proof)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {canRequest && requestable ? (
            <div className="grid gap-2">
              <p className="text-xs text-muted-foreground">{ACTIVITY_NO_PROOF_MESSAGE}.</p>
              <Button type="button" disabled={busy} onClick={() => void handleRequest()}>
                Solicitar conclusão
              </Button>
            </div>
          ) : null}

          {canApprove && approvable ? (
            <div className="grid gap-2">
              <p className="text-xs text-muted-foreground">
                Aprovar conclui a atividade e distribui o prêmio entre os membros ativos do projeto.
              </p>
              <Button type="button" disabled={busy} onClick={() => void handleApprove()}>
                Aprovar conclusão
              </Button>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
