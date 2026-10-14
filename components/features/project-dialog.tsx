"use client"

/**
 * Diálogo de projeto. Na edição, continua uma página só. Na criação, virou o passo a passo do
 * DEC-100: dados, equipe (opcional), cronograma (opcional), criar. Os dois passos opcionais
 * podem ser pulados, e pular o cronograma deixa a criação idêntica à de antes (regra 9 do plano).
 *
 * O passo de cronograma usa o MESMO `CronogramaEditor` do painel do detalhe. A diferença é onde
 * a linha mora: no painel, cada ação escreve; no wizard, a linha fica em estado local e entra
 * numa escrita só junto com o projeto, porque o projeto ainda não existe.
 */

import { useState, useEffect, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/contexts/auth-context"
import { useProject } from "@/contexts/project-context"
import { useUser } from "@/contexts/user-context"
import type { Project, ProjectFormData } from "@/contexts/types"
import { Checkbox } from "@/components/ui/checkbox"
import {
  addProjectMember,
  listProjectMembers,
  removeProjectMember,
  setProjectMemberRoles,
  type ProjectMember,
} from "@/lib/api/project-members"
import { CronogramaEditor, type CronogramaActivityRow, type CronogramaGoalRow } from "@/components/features/cronograma-editor"
import {
  ACTIVITY_MIN_MONTH_MESSAGE,
  cronogramaMonthColumns,
  nextCronogramaOrder,
  toggleActivityMonthRange,
} from "@/backend/domain"
import { todayDateOnly } from "@/lib/date-only"

interface ProjectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  project?: Project | null
}

export function ProjectDialog({ open, onOpenChange, project = null }: ProjectDialogProps) {
  const { user } = useAuth()
  const { createProject, updateProject } = useProject()
  const { users } = useUser()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // V5-5 (DEC-100): passo do wizard de criação. Editar projeto não tem passo — o cronograma da
  // edição é escrito no painel do detalhe, e duplicar o formulário seria a mesma tela em duas
  // versões.
  const [step, setStep] = useState(0)
  const [cronogramaGoals, setCronogramaGoals] = useState<CronogramaGoalRow[]>([])
  const [cronogramaActivities, setCronogramaActivities] = useState<CronogramaActivityRow[]>([])

  const [formData, setFormData] = useState<ProjectFormData>({
    name: "",
    description: "",
    status: "active",
    leaderId: null,
    volunteerIds: [],
    links: [],
    startDate: "",
    endDate: "",
    editalNumber: "",
    processNumber: "",
    proppiNumber: "",
  })

  // Reset form when dialog opens/closes or project changes
  useEffect(() => {
    if (open && project) {
      setFormData({
        name: project.name,
        description: project.description || "",
        status: project.status,
        leaderId: project.leaderId ?? null,
        volunteerIds: [],
        links: project.links || [],
        startDate: project.startDate || "",
        endDate: project.endDate || "",
        editalNumber: project.editalNumber || "",
        processNumber: project.processNumber || "",
        proppiNumber: project.proppiNumber || "",
      })
      void (async () => {
        try {
          const members = await listProjectMembers(project.id)
          const volunteerIds = members
            .filter((member) => member.roles.includes("VOLUNTARIO"))
            .map((member) => member.userId)
          setFormData((prev) => ({ ...prev, volunteerIds }))
        } catch (error) {
          console.error("Erro ao carregar voluntários do projeto:", error)
        }
      })()
    } else if (open) {
      setFormData({
        name: "",
        description: "",
        status: "active",
        leaderId: null,
        volunteerIds: [],
        links: [],
        startDate: "",
        endDate: "",
        editalNumber: "",
        processNumber: "",
        proppiNumber: "",
      })
    }
    setError(null)
    setStep(0)
    setCronogramaGoals([])
    setCronogramaActivities([])
  }, [open, project])

  const syncProjectVolunteers = async (projectId: number, volunteerIds: number[]) => {
    const members = await listProjectMembers(projectId)
    const selectedVolunteerIds = new Set(volunteerIds)
    const memberByUserId = new Map<number, ProjectMember>(
      members.map((member) => [member.userId, member]),
    )

    for (const volunteerId of selectedVolunteerIds) {
      const existingMember = memberByUserId.get(volunteerId)
      if (!existingMember) {
        await addProjectMember(projectId, volunteerId, ["VOLUNTARIO"])
        continue
      }

      if (!existingMember.roles.includes("VOLUNTARIO")) {
        const mergedRoles = Array.from(new Set([...existingMember.roles, "VOLUNTARIO"]))
        await setProjectMemberRoles(projectId, volunteerId, mergedRoles)
      }
    }

    const volunteerMembers = members.filter((member) => member.roles.includes("VOLUNTARIO"))
    for (const volunteerMember of volunteerMembers) {
      if (selectedVolunteerIds.has(volunteerMember.userId)) continue

      const remainingRoles = volunteerMember.roles.filter((role) => role !== "VOLUNTARIO")
      if (remainingRoles.length === 0) {
        await removeProjectMember(projectId, volunteerMember.id)
      } else {
        await setProjectMemberRoles(projectId, volunteerMember.userId, remainingRoles)
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectChange = (value: string) => {
    setFormData((prev) => ({ ...prev, status: value as "active" | "completed" | "archived" }))
  }

  // Handle dynamic links
  const handleLinkChange = (index: number, field: "label" | "url", value: string) => {
    setFormData((prev) => {
      const links = [...(prev.links || [])]
      links[index] = { ...links[index], [field]: value }
      return { ...prev, links }
    })
  }
  const handleAddLink = () => {
    setFormData((prev) => ({ ...prev, links: [...(prev.links || []), { label: "", url: "" }] }))
  }
  const handleRemoveLink = (index: number) => {
    setFormData((prev) => {
      const links = [...(prev.links || [])]
      links.splice(index, 1)
      return { ...prev, links }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!user) return

    const payloadForUpdate = { ...formData }
    const { volunteerIds = [] } = formData
    delete (payloadForUpdate as any).volunteerIds

    try {
      setIsSubmitting(true)
      setError(null)

      if (project) {
        await updateProject(project.id, payloadForUpdate)
        await syncProjectVolunteers(project.id, volunteerIds)
      } else {
        // Passo pulado é `undefined`, e `undefined` no corpo é a criação de antes (regra 9).
        const cronograma = cronogramaSeed()
        await createProject({
          ...formData,
          volunteerIds,
          ...(cronograma ? { cronograma } : {}),
        })
      }

      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar projeto")
      console.error(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const leaderOptions = users.filter(u =>
    u.roles?.includes("COORDENADOR") ||
    u.roles?.includes("GERENTE") ||
    u.roles?.includes("GERENTE_PROJETO")
  )

  const volunteerOptions = users.filter(u =>
    u.roles?.includes("VOLUNTARIO") || u.roles?.includes("COLABORADOR")
  )

  const handleLeaderChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      leaderId: value === "none" ? null : Number(value)
    }))
  }

  const toggleVolunteer = (userId: number, checked: boolean) => {
    setFormData(prev => {
      const current = prev.volunteerIds || []
      const updated = checked
        ? Array.from(new Set([...current, userId]))
        : current.filter(id => id !== userId)
      return { ...prev, volunteerIds: updated }
    })
  }

  // ---- V5-5 (DEC-100): o wizard de criação ----
  const isWizard = !project
  const stepTitles = ["Dados do projeto", "Equipe", "Cronograma"]
  const showStep = (index: number) => !isWizard || step === index
  // Nome é o único campo obrigatório do projeto, e o `required` do input não segura quem clica
  // em "Avançar": a trava é daqui, senão o passo 1 abre com projeto sem nome.
  const canAdvance = step !== 0 || formData.name.trim().length > 0

  function handleBack() {
    setStep((current) => Math.max(current - 1, 0))
  }

  function handleAdvance() {
    if (!canAdvance) return
    setStep((current) => Math.min(current + 1, stepTitles.length - 1))
  }

  const today = useMemo(() => todayDateOnly(), [])
  const cronogramaMonths = useMemo(
    () =>
      cronogramaMonthColumns({
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        today,
      }),
    [formData.startDate, formData.endDate, today],
  )
  // O responsável de uma atividade precisa participar do projeto. No wizard o projeto ainda não
  // existe, então as opções são o conjunto que VAI participar: quem cria, o líder e os
  // voluntários marcados no passo de equipe. É o mesmo conjunto que o servidor aceita
  // (`allowedResponsibleIds`), e é por isso que a tela não inventa lista própria.
  const cronogramaMemberOptions = useMemo(() => {
    const ids = new Set<number>(formData.volunteerIds ?? [])
    if (formData.leaderId) ids.add(formData.leaderId)
    if (user) ids.add(user.id)
    return [...ids].map((id) => ({
      id,
      name: users.find((option) => option.id === id)?.name ?? `#${id}`,
    }))
  }, [formData.leaderId, formData.volunteerIds, user, users])

  function handleAddCronogramaGoal() {
    setCronogramaGoals((current) => [
      ...current,
      {
        id: null,
        order: nextCronogramaOrder(current.map((goal) => goal.order)),
        description: "",
        target: "",
      },
    ])
  }

  function handleAddCronogramaActivity() {
    // Sem mês marcado não existe linha: a atividade nova nasce no primeiro mês da janela.
    const month = cronogramaMonths[0] ?? today.slice(0, 7)
    setCronogramaActivities((current) => [
      ...current,
      {
        id: null,
        order: nextCronogramaOrder(current.map((activity) => activity.order)),
        description: "",
        responsibleId: null,
        firstMonth: month,
        lastMonth: month,
      },
    ])
  }

  function handleCronogramaGoalChange(
    goal: CronogramaGoalRow,
    patch: { description?: string; target?: string },
  ) {
    setCronogramaGoals((current) =>
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
  }

  function handleCronogramaActivityChange(
    activity: CronogramaActivityRow,
    patch: { description?: string; responsibleId?: number | null },
  ) {
    setCronogramaActivities((current) =>
      current.map((row) =>
        row === activity
          ? {
              ...row,
              ...(patch.description !== undefined ? { description: patch.description } : {}),
              ...(patch.responsibleId !== undefined ? { responsibleId: patch.responsibleId } : {}),
            }
          : row,
      ),
    )
  }

  function handleCronogramaToggleMonth(activity: CronogramaActivityRow, monthKey: string) {
    const next = toggleActivityMonthRange(
      { firstMonth: activity.firstMonth, lastMonth: activity.lastMonth },
      monthKey,
    )
    if (next === null) {
      // A linha não tem estado "sem mês". Desmarcar a única marca é recusado com a frase do
      // domínio, não ignorado em silêncio.
      setError(ACTIVITY_MIN_MONTH_MESSAGE)
      return
    }
    setError(null)
    setCronogramaActivities((current) =>
      current.map((row) => (row === activity ? { ...row, ...next } : row)),
    )
  }

  function handleCronogramaDeleteGoal(goal: CronogramaGoalRow) {
    setCronogramaGoals((current) => current.filter((row) => row !== goal))
  }

  function handleCronogramaDeleteActivity(activity: CronogramaActivityRow) {
    setCronogramaActivities((current) => current.filter((row) => row !== activity))
  }

  function cronogramaSeed() {
    const goals = cronogramaGoals
      .filter((goal) => goal.description.trim() !== "")
      .map((goal) => ({
        description: goal.description.trim(),
        ...(goal.target.trim() === "" ? {} : { target: Number(goal.target) }),
      }))
    const activities = cronogramaActivities
      .filter((activity) => activity.description.trim() !== "")
      .map((activity) => ({
        description: activity.description.trim(),
        firstMonth: activity.firstMonth,
        lastMonth: activity.lastMonth,
        ...(activity.responsibleId === null ? {} : { responsibleId: activity.responsibleId }),
      }))
    return goals.length > 0 || activities.length > 0 ? { goals, activities } : undefined
  }

  return (
    <Dialog open={open} onOpenChange={(newOpen) => !isSubmitting && onOpenChange(newOpen)}>
      <DialogContent
        className={`h-[90vh] ${isWizard && step === 2 ? "sm:max-w-[900px]" : "sm:max-w-[500px]"}`}
        style={{ overflowY: "auto" }}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{project ? "Editar Projeto" : "Adicionar Novo Projeto"}</DialogTitle>
            {isWizard ? (
              <p className="text-sm text-muted-foreground">
                Passo {step + 1} de {stepTitles.length}: {stepTitles[step]}
              </p>
            ) : null}
          </DialogHeader>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-destructive/10 border border-red-200 dark:border-destructive/25 rounded-md">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          <div className="grid gap-4 py-4">
            {showStep(0) ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome do Projeto</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="Digite o nome do projeto"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Digite a descrição do projeto"
                  />
                </div>

                {/* V5-2b: período e cadastro do projeto (DEC-61). Data civil, dia a dia. */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="startDate">Início do projeto</Label>
                    <Input
                      id="startDate"
                      name="startDate"
                      type="date"
                      value={formData.startDate || ""}
                      onChange={handleChange}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="endDate">Término do projeto</Label>
                    <Input
                      id="endDate"
                      name="endDate"
                      type="date"
                      value={formData.endDate || ""}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="editalNumber">Número do edital</Label>
                  <Input
                    id="editalNumber"
                    name="editalNumber"
                    value={formData.editalNumber || ""}
                    onChange={handleChange}
                    placeholder="Ex.: EDITAL 12/2026"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="processNumber">Número do processo</Label>
                  <Input
                    id="processNumber"
                    name="processNumber"
                    value={formData.processNumber || ""}
                    onChange={handleChange}
                    placeholder="Ex.: IFNMG-2026/0042"
                  />
                </div>

                {/* V5-4a (DEC-140): o nº PROPPI sai nos dois formulários oficiais. */}
                <div className="grid gap-2">
                  <Label htmlFor="proppiNumber">Número PROPPI</Label>
                  <Input
                    id="proppiNumber"
                    name="proppiNumber"
                    value={formData.proppiNumber || ""}
                    onChange={handleChange}
                    placeholder="Ex.: 2026.01.001"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={handleSelectChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="completed">Concluído</SelectItem>
                      <SelectItem value="archived">Arquivado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            {showStep(1) ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="leader">Líder do Projeto</Label>
                  <Select
                    value={formData.leaderId ? String(formData.leaderId) : "none"}
                    onValueChange={handleLeaderChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um líder" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem líder definido</SelectItem>
                      {leaderOptions.map((option) => (
                        <SelectItem key={option.id} value={String(option.id)}>
                          {option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Voluntários iniciais</Label>
                  <div className="rounded-md border p-2 max-h-48 overflow-y-auto space-y-2">
                    {volunteerOptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum voluntário disponível para seleção.
                      </p>
                    ) : (
                      volunteerOptions.map((option) => (
                        <label key={option.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={formData.volunteerIds?.includes(option.id) || false}
                            onCheckedChange={(checked) => toggleVolunteer(option.id, Boolean(checked))}
                          />
                          <span>{option.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label>Links</Label>
                  {(formData.links || []).map((link, idx) => (
                    <div key={idx} className="flex gap-2 mb-2">
                      <Input
                        placeholder="Nome (ex: Figma, GitHub)"
                        value={link.label}
                        onChange={(e) => handleLinkChange(idx, "label", e.target.value)}
                        className="w-1/3"
                      />
                      <Input
                        placeholder="URL"
                        value={link.url}
                        onChange={(e) => handleLinkChange(idx, "url", e.target.value)}
                        className="flex-1"
                      />
                      <Button type="button" variant="destructive" onClick={() => handleRemoveLink(idx)}>
                        -
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={handleAddLink}>
                    + Adicionar Link
                  </Button>
                </div>
              </>
            ) : null}

            {/* V5-5 (DEC-100): passo opcional de cronograma. Pular é não mandar a lista, e a
                criação continua a de antes. As linhas ficam locais até o projeto nascer, porque
                o projeto ainda não existe para receber escrita por linha. */}
            {isWizard && step === 2 ? (
              <CronogramaEditor
                months={cronogramaMonths}
                goals={cronogramaGoals}
                activities={cronogramaActivities}
                memberOptions={cronogramaMemberOptions}
                today={today}
                onAddGoal={handleAddCronogramaGoal}
                onGoalChange={handleCronogramaGoalChange}
                onDeleteGoal={handleCronogramaDeleteGoal}
                onAddActivity={handleAddCronogramaActivity}
                onActivityChange={handleCronogramaActivityChange}
                onToggleMonth={handleCronogramaToggleMonth}
                onDeleteActivity={handleCronogramaDeleteActivity}
              />
            ) : null}
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            {isWizard && step > 0 ? (
              <Button type="button" variant="outline" onClick={handleBack} disabled={isSubmitting}>
                Voltar
              </Button>
            ) : null}
            {isWizard && step < stepTitles.length - 1 ? (
              <Button type="button" onClick={handleAdvance} disabled={!canAdvance}>
                Avançar
              </Button>
            ) : null}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : project ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
