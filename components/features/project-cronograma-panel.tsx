"use client"

/**
 * ProjectCronogramaPanel — o cronograma do projeto no diálogo de detalhe (V5-5, DEC-100/126/151).
 *
 * Lê o `GET /cronograma` (colunas, metas e atividades já derivadas) e escreve pelo caminho
 * estreito: cada ação manda só o que mudou, no corpo daquele recurso. A tela não monta a regra
 * — o que chega de período, meses e recompensa vem do domínio, e o clique na grade é a mesma
 * `toggleActivityMonthRange` que a rota usa (DEC-90).
 *
 * Desde o V5-7a (DEC-76/162) a linha também se abre em diálogo: "Conclusão" leva ao
 * `ActivityCompletionDialog`, onde se anexam provas e se solicita a conclusão. O botão obedece
 * ao gate da DEC-76, calculado pela mesma função do domínio que o servidor executa.
 *
 * Linha nova nasce local (id `null`) e só é escrita quando a descrição é confirmada: criar linha
 * vazia seria poluir o cronograma com uma etapa sem nome, e o domínio recusa descrição vazia por
 * decisão (a brochura não tem "Etapa" sem "Descrição da Atividade").
 *
 * Quem pode escrever é decidido pelo servidor (gate de gestão, DEC-92): `canManage` controla
 * apenas quais controles aparecem. Um 403 que chega mesmo assim é tratado como erro, não como
 * botão desabilitado.
 */

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { useAuth } from "@/contexts/auth-context"
import {
  ACTIVITY_MIN_MONTH_MESSAGE,
  canActorApproveActivityCompletionDecision,
  canActorRequestActivityCompletionDecision,
  monthColumnLabel,
  nextCronogramaOrder,
  toggleActivityMonthRange,
} from "@/backend/domain"
import { listProjectMembers, type ProjectMember } from "@/lib/api/project-members"
import { ActivityCompletionDialog } from "@/components/features/activity-completion-dialog"
import {
  createProjectActivity,
  createProjectGoal,
  deleteProjectActivity,
  deleteProjectGoal,
  getCronograma,
  updateProjectActivity,
  updateProjectGoal,
  type ProjectActivity,
  type ProjectGoal,
} from "@/lib/api/project-cronograma"
import {
  CronogramaEditor,
  type CronogramaActivityRow,
  type CronogramaGoalRow,
  type CronogramaMemberOption,
} from "@/components/features/cronograma-editor"

interface ProjectCronogramaPanelProps {
  projectId: number
  canManage: boolean
  /**
   * V5-7a (DEC-76/162): o gate de PEDIR conclusão é o par da DEC-76 (líder OU membership de
   * gestor), não a ACL de gestão da grade. A tela calcula a decisão com a MESMA função do
   * domínio que o servidor usa (DEC-92); o 403 que chegar mesmo assim é erro, não botão.
   */
  leaderId?: number | null
  initialMembers?: ProjectMember[]
}

interface PersistedGoal {
  description: string
  target: number | null
}

interface PersistedActivity {
  description: string
  responsibleId: number | null
  firstMonth: string
  lastMonth: string
}

function goalRowFrom(goal: ProjectGoal): CronogramaGoalRow {
  return {
    id: goal.id,
    order: goal.order,
    description: goal.description,
    target: goal.target === null ? "" : String(goal.target),
  }
}

function activityRowFrom(activity: ProjectActivity): CronogramaActivityRow {
  return {
    id: activity.id,
    order: activity.order,
    description: activity.description,
    responsibleId: activity.responsibleId,
    firstMonth: activity.firstMonth,
    lastMonth: activity.lastMonth,
    status: activity.status,
    requestedBy: activity.requestedBy,
    requestedAt: activity.requestedAt,
  }
}

function targetFromText(text: string): number | null {
  return text.trim() === "" ? null : Number(text)
}

export function ProjectCronogramaPanel({ projectId, canManage, leaderId, initialMembers }: ProjectCronogramaPanelProps) {
  const { toast } = useToast()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState<string[]>([])
  const [today, setToday] = useState("")
  const [goals, setGoals] = useState<CronogramaGoalRow[]>([])
  const [activities, setActivities] = useState<CronogramaActivityRow[]>([])
  const [members, setMembers] = useState<CronogramaMemberOption[]>([])
  /** Papéis da membership por usuário — a conta do gate de pedir (DEC-76), lida da mesma lista. */
  const [memberRolesById, setMemberRolesById] = useState(new Map<number, string[]>())
  const [completionActivity, setCompletionActivity] = useState<CronogramaActivityRow | null>(null)
  const [persistedGoals, setPersistedGoals] = useState(new Map<number, PersistedGoal>())
  const [persistedActivities, setPersistedActivities] = useState(new Map<number, PersistedActivity>())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [view, memberRows] = await Promise.all([
        getCronograma(projectId),
        initialMembers ? Promise.resolve(initialMembers) : listProjectMembers(projectId).catch(() => []),
      ])
      setMonths(view.months)
      setToday(view.today)
      setGoals(view.goals.map(goalRowFrom))
      setActivities(view.activities.map(activityRowFrom))
      setMembers(
        memberRows.map((member) => ({
          id: member.userId,
          name: member.userName ?? `#${member.userId}`,
        })),
      )
      setMemberRolesById(new Map(memberRows.map((member) => [member.userId, member.roles ?? []])))
      setPersistedGoals(
        new Map(view.goals.map((goal) => [goal.id, { description: goal.description, target: goal.target }])),
      )
      setPersistedActivities(
        new Map(
          view.activities.map((activity) => [
            activity.id,
            {
              description: activity.description,
              responsibleId: activity.responsibleId,
              firstMonth: activity.firstMonth,
              lastMonth: activity.lastMonth,
            },
          ]),
        ),
      )
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao carregar o cronograma",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, toast, initialMembers])

  useEffect(() => {
    load()
  }, [load])

  // O gate de PEDIR (DEC-76) é calculado pela MESMA função do domínio que o servidor executa
  // (DEC-92): líder OU membership de gestor. Papel global sem membership não entra — quem
  // aprova é o global (DEC-77), não quem pede.
  const canRequestCompletion = canActorRequestActivityCompletionDecision(
    user?.id ?? -1,
    leaderId ?? null,
    user ? memberRolesById.get(user.id) ?? null : null,
  )

  // O gate de ABRIR a linha é o par "pedir OU aprovar" (DEC-76/77): o global manager aprova
  // e por isso também abre o diálogo; a auto-aprovação (GERENTE não aprova o que pediu) é da
  // MESMA função do domínio, por linha.
  const canApproveRow = (row: CronogramaActivityRow) =>
    canActorApproveActivityCompletionDecision(user?.id ?? -1, user?.roles ?? [], row.requestedBy ?? null)
  const canOpenCompletion = (row: CronogramaActivityRow) => canRequestCompletion || canApproveRow(row)

  function handleRequested(updated: ProjectActivity) {
    setActivities((current) =>
      current.map((row) => (row.id === updated.id ? activityRowFrom(updated) : row)),
    )
  }

  // Nenhum handler async sem catch: rejeição solta em `onClick` derruba o gate do Vitest com
  // "Unhandled Rejection" mesmo com todos os testes passando (medido no V4-4b, DEC-85).
  function reportError(error: unknown, fallback: string) {
    toast({
      title: "Erro",
      description: error instanceof Error ? error.message : fallback,
      variant: "destructive",
    })
  }

  function handleAddGoal() {
    setGoals((current) => [
      ...current,
      { id: null, order: nextCronogramaOrder(current.map((goal) => goal.order)), description: "", target: "" },
    ])
  }

  function handleAddActivity() {
    // V5-13 (DEC-172): a linha nova nasce SEM marca. Antes ela nascia marcada no primeiro mês
    // da janela, e clicar no mês 5 estendia de 1 até 5 — a atividade não conseguia começar num
    // mês posterior. Sem marca a linha é rascunho: só vira linha do projeto quando descrição e
    // pelo menos um mês existem (o servidor exige os dois).
    setActivities((current) => [
      ...current,
      {
        id: null,
        order: nextCronogramaOrder(current.map((activity) => activity.order)),
        description: "",
        responsibleId: null,
        firstMonth: null,
        lastMonth: null,
      },
    ])
  }

  async function commitGoal(goal: CronogramaGoalRow) {
    const description = goal.description.trim()
    const target = targetFromText(goal.target)

    if (goal.id === null) {
      if (description === "") return
      try {
        const created = await createProjectGoal(projectId, {
          description,
          target: target === null ? undefined : target,
        })
        setPersistedGoals((current) =>
          new Map(current).set(created.id, { description: created.description, target: created.target }),
        )
        setGoals((current) => current.map((row) => (row === goal ? goalRowFrom(created) : row)))
      } catch (error) {
        reportError(error, "Falha ao criar meta")
      }
      return
    }

    const before = persistedGoals.get(goal.id)
    const patch: { description?: string; target?: number | null } = {}
    if (before && before.description !== description) patch.description = description
    if (before && before.target !== target) patch.target = target
    if (Object.keys(patch).length === 0) return

    try {
      const updated = await updateProjectGoal(projectId, goal.id, patch)
      setPersistedGoals((current) =>
        new Map(current).set(updated.id, { description: updated.description, target: updated.target }),
      )
      setGoals((current) => current.map((row) => (row.id === updated.id ? goalRowFrom(updated) : row)))
    } catch (error) {
      reportError(error, "Falha ao atualizar meta")
    }
  }

  async function commitActivity(activity: CronogramaActivityRow) {
    const description = activity.description.trim()

    if (activity.id === null) {
      // Linha-rascunho (V5-13, DEC-172): só é escrita quando descrição E mês existem. O POST
      // sem marca seria o 400 do servidor (`ACTIVITY_MIN_MONTH_MESSAGE`) — a tela não empurra.
      if (description === "" || activity.firstMonth === null || activity.lastMonth === null) return
      try {
        const created = await createProjectActivity(projectId, {
          description,
          firstMonth: activity.firstMonth,
          lastMonth: activity.lastMonth,
          responsibleId: activity.responsibleId,
        })
        setPersistedActivities((current) =>
          new Map(current).set(created.id, {
            description: created.description,
            responsibleId: created.responsibleId,
            firstMonth: created.firstMonth,
            lastMonth: created.lastMonth,
          }),
        )
        setActivities((current) => current.map((row) => (row === activity ? activityRowFrom(created) : row)))
      } catch (error) {
        reportError(error, "Falha ao criar atividade")
      }
      return
    }

    const before = persistedActivities.get(activity.id)
    const patch: { description?: string; responsibleId?: number | null } = {}
    if (before && before.description !== description) patch.description = description
    if (before && before.responsibleId !== activity.responsibleId) patch.responsibleId = activity.responsibleId
    if (Object.keys(patch).length === 0) return

    try {
      const updated = await updateProjectActivity(projectId, activity.id, patch)
      setPersistedActivities((current) =>
        new Map(current).set(updated.id, {
          description: updated.description,
          responsibleId: updated.responsibleId,
          firstMonth: updated.firstMonth,
          lastMonth: updated.lastMonth,
        }),
      )
      setActivities((current) =>
        current.map((row) => (row.id === updated.id ? activityRowFrom(updated) : row)),
      )
    } catch (error) {
      reportError(error, "Falha ao atualizar atividade")
    }
  }

  function handleGoalChange(
    goal: CronogramaGoalRow,
    patch: { description?: string; target?: string },
    phase: "typing" | "commit",
  ) {
    if (phase === "typing") {
      setGoals((current) =>
        current.map((row) =>
          row === goal
            ? {
                ...row,
                ...(patch.description !== undefined ? { description: patch.description } : {}),
                ...(patch.target !== undefined ? { target: patch.target } : {}),
              }
            : row,
        ),
      )
      return
    }
    void commitGoal(goal)
  }

  function handleActivityChange(
    activity: CronogramaActivityRow,
    patch: { description?: string; responsibleId?: number | null },
    phase: "typing" | "commit",
  ) {
    const next = {
      ...activity,
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.responsibleId !== undefined ? { responsibleId: patch.responsibleId } : {}),
    }

    if (phase === "typing") {
      setActivities((current) => current.map((row) => (row === activity ? next : row)))
      return
    }
    void commitActivity(next)
  }

  async function handleToggleMonth(activity: CronogramaActivityRow, monthKey: string) {
    const next = toggleActivityMonthRange(
      activity.firstMonth !== null && activity.lastMonth !== null
        ? { firstMonth: activity.firstMonth, lastMonth: activity.lastMonth }
        : null,
      monthKey,
    )

    if (next === null) {
      if (activity.id === null) {
        // Rascunho pode voltar a estar sem marca (DEC-172): o usuário trocou o mês de início e
        // apagou a marca errada. Persistida, a linha nunca fica sem mês — a recusa é a frase
        // congelada do domínio e a linha não muda.
        setActivities((current) =>
          current.map((row) => (row === activity ? { ...row, firstMonth: null, lastMonth: null } : row)),
        )
        return
      }
      toast({ title: "Ação não permitida", description: ACTIVITY_MIN_MONTH_MESSAGE })
      return
    }

    if (activity.id === null) {
      const draft = { ...activity, ...next }
      setActivities((current) => current.map((row) => (row === activity ? draft : row)))
      // Marcar é o que completa a linha-rascunho: se a descrição já existe, o POST sai daqui —
      // o usuário não precisa voltar ao campo de descrição para salvar.
      if (draft.description.trim() !== "") void commitActivity(draft)
      return
    }

    const before = persistedActivities.get(activity.id)
    if (before && before.firstMonth === next.firstMonth && before.lastMonth === next.lastMonth) return

    try {
      const updated = await updateProjectActivity(projectId, activity.id, next)
      setPersistedActivities((current) =>
        new Map(current).set(updated.id, {
          description: updated.description,
          responsibleId: updated.responsibleId,
          firstMonth: updated.firstMonth,
          lastMonth: updated.lastMonth,
        }),
      )
      setActivities((current) =>
        current.map((row) => (row.id === updated.id ? activityRowFrom(updated) : row)),
      )
    } catch (error) {
      reportError(error, "Falha ao marcar o mês")
    }
  }

  async function handleDeleteGoal(goal: CronogramaGoalRow) {
    if (goal.id === null) {
      setGoals((current) => current.filter((row) => row !== goal))
      return
    }
    if (!window.confirm("Apagar esta meta do projeto?")) return

    try {
      await deleteProjectGoal(projectId, goal.id)
      setPersistedGoals((current) => {
        const next = new Map(current)
        next.delete(goal.id!)
        return next
      })
      setGoals((current) => current.filter((row) => row.id !== goal.id))
    } catch (error) {
      reportError(error, "Falha ao apagar meta")
    }
  }

  async function handleDeleteActivity(activity: CronogramaActivityRow) {
    if (activity.id === null) {
      setActivities((current) => current.filter((row) => row !== activity))
      return
    }
    if (!window.confirm("Apagar esta atividade do cronograma? As tarefas do projeto continuam.")) return

    try {
      await deleteProjectActivity(projectId, activity.id)
      setPersistedActivities((current) => {
        const next = new Map(current)
        next.delete(activity.id!)
        return next
      })
      setActivities((current) => current.filter((row) => row.id !== activity.id))
    } catch (error) {
      reportError(error, "Falha ao apagar atividade")
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cronograma
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando metas e atividades…</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cronograma</CardTitle>
        <CardDescription>
          {months.length > 0
            ? `${monthColumnLabel(months[0])} a ${monthColumnLabel(months[months.length - 1])} — ${months.length} ${
                months.length === 1 ? "mês" : "meses"
              } na grade`
            : "Sem meses na grade"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CronogramaEditor
          months={months}
          goals={goals}
          activities={activities}
          memberOptions={members}
          today={today}
          canManage={canManage}
          onAddGoal={handleAddGoal}
          onGoalChange={handleGoalChange}
          onDeleteGoal={handleDeleteGoal}
          onAddActivity={handleAddActivity}
          onActivityChange={handleActivityChange}
          onToggleMonth={handleToggleMonth}
          onDeleteActivity={handleDeleteActivity}
          canOpenCompletion={canOpenCompletion}
          onOpenCompletion={(row) => row.id !== null && setCompletionActivity(row)}
        />

        {completionActivity && completionActivity.id !== null ? (
          <ActivityCompletionDialog
            projectId={projectId}
            activity={completionActivity}
            members={members}
            canRequest={canRequestCompletion}
            canApprove={canApproveRow(completionActivity)}
            onOpenChange={(open) => {
              if (!open) setCompletionActivity(null)
            }}
            onRequested={handleRequested}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
