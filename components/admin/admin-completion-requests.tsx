"use client"

import { useEffect, useState } from "react"
import { ClipboardCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/contexts/auth-context"
import { useToast } from "@/contexts/use-toast"
import { fetchAPI } from "@/contexts/api-client"
import { canActorApproveActivityCompletionDecision } from "@/backend/domain"

/**
 * S01 (plan-v12, R1/R2, DEC-238) — a fila global de solicitações de conclusão na aba
 * "Conclusões" do painel.
 *
 * A linha é a projeção que a rota devolve: projeto, atividade, período, solicitante e prêmio
 * previsto. O botão obedece o MESMO gate do domínio que a rota de aprovar aplica
 * (`canActorApproveActivityCompletionDecision`): GERENTE não aprova a linha que ele pediu,
 * COORDENADOR aprova a dele. Aprovar é o POST da rota existente — a tela não recalcula o
 * prêmio (R7 da casa), o toast lê `award` da resposta. Recusa chega com a frase do servidor
 * (DEC-90). Fila vazia tem estado vazio, como a fila de tarefas da V6-11i.
 */

export interface CompletionRequestRow {
  projectId: number
  projectName: string
  activityId: number
  order: number
  description: string
  periodoInicio: string
  periodoFim: string
  requestedBy: number | null
  requestedByName: string | null
  requestedAt: string | null
  award: number
}

/** Data civil `YYYY-MM-DD` formatada por substring — `new Date` em data civil é o erro da DEC-132. */
function civilDayLabel(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`
}

export function AdminCompletionRequests() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [rows, setRows] = useState<CompletionRequestRow[] | null>(null)
  const [busyActivityId, setBusyActivityId] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    fetchAPI<{ requests: CompletionRequestRow[] }>("/api/admin/completion-requests")
      .then((data) => {
        if (live) setRows(data.requests)
      })
      .catch(() => {
        if (live) setRows([])
      })
    return () => {
      live = false
    }
  }, [])

  const approve = async (row: CompletionRequestRow) => {
    setBusyActivityId(row.activityId)
    try {
      const result = await fetchAPI<{ award: number }>(
        `/api/projects/${row.projectId}/activities/${row.activityId}/approve-completion`,
        { method: "POST" },
      )
      // A linha sai da fila porque o status mudou no servidor — a fila é leitura de
      // COMPLETION_REQUESTED, e a próxima leitura não a traz.
      setRows((current) => (current ?? []).filter((r) => r.activityId !== row.activityId))
      toast({
        title: "Atividade concluída",
        description:
          result.award > 0
            ? `${result.award} pontos distribuídos entre os membros do projeto.`
            : "Nenhum ponto distribuído — prêmio zerado pelo atraso (piso 0).",
      })
    } catch (error) {
      toast({
        title: "Ação não permitida",
        description: error instanceof Error ? error.message : "Falha ao aprovar a conclusão",
        variant: "destructive",
      })
    } finally {
      setBusyActivityId(null)
    }
  }

  if (rows === null) {
    return <p className="py-3 text-sm text-muted-foreground">Carregando conclusões solicitadas…</p>
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          Conclusões solicitadas
        </CardTitle>
        <CardDescription>
          Atividades com conclusão pedida, de todos os projetos. Aprovar conclui a atividade e
          distribui o prêmio entre os membros ativos do projeto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Nenhuma conclusão solicitada</p>
        ) : (
          rows.map((row) => {
            const canApprove =
              user && canActorApproveActivityCompletionDecision(user.id, user.roles, row.requestedBy ?? null)
            return (
              <div key={row.activityId} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{row.projectName}</p>
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">Atividade {row.order} · </span>
                      <span>{row.description}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Período: {civilDayLabel(row.periodoInicio)} a {civilDayLabel(row.periodoFim)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.requestedByName && row.requestedAt
                        ? `Solicitada por ${row.requestedByName} em ${civilDayLabel(row.requestedAt.slice(0, 10))}`
                        : "Solicitada (o solicitante foi removido)"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">Prêmio previsto: {row.award} pts</p>
                    {canApprove ? (
                      <Button
                        size="sm"
                        className="mt-2"
                        aria-label={`Aprovar conclusão da atividade ${row.order} do projeto ${row.projectName}`}
                        disabled={busyActivityId === row.activityId}
                        onClick={() => void approve(row)}
                      >
                        Aprovar conclusão
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
