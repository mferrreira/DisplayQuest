"use client"

/**
 * TaskDialog (E2/T2.6) — create/edit, RHF+Zod (spec §5.2).
 * Mirrors gateway constraints: title 1–200, description ≤1000,
 * isGlobal requires MANAGE_USERS and disables project/assignees/visibility (gateway :86–93).
 */
import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { HelpCircle, Info, ListTodo, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useProjects } from "@/features/projects"
import { useUsers } from "@/features/users"
import { useTaskMutations } from "../hooks/use-tasks"
import { parseBacklogLines } from "../utils/move-rules"
import { POINTS_PER_TASK, supportsSubtasks, SUBTASK_TITLE_MAX_LENGTH } from ".."
import type { Task } from "@/entities/task"
import { listProjectMembers, type ProjectMember } from "@/lib/api/project-members"

type TaskDialogTab = "task" | "backlog"

const BACKLOG_TEMPLATE = [
  "Comprar reagentes !alta #25/12",
  "Calibrar equipamento #15/03/2026",
  "Testar sensor !urgente",
  "Analisar dados !baixa #01/01",
  "Escrever relatório !media",
].join("\n")

const taskFormSchema = z.object({
  title: z.string().min(1, "O título é obrigatório").max(200, "Máximo de 200 caracteres"),
  description: z.string().max(1000, "Máximo de 1000 caracteres"),
  projectId: z.string().optional(),
  assigneeIds: z.array(z.number().int()),
  dueDate: z.string().optional(),
  // plan-v3 OND1-D (AC-P3-03): sem campo de pontos — o servidor aplica POINTS_PER_TASK.
  priority: z.enum(["low", "medium", "high", "urgent"]),
  taskVisibility: z.enum(["public", "delegated", "private"]),
  isGlobal: z.boolean(),
  creationMode: z.enum(["individual", "shared"]),
})

type TaskFormValues = z.input<typeof taskFormSchema>

export interface TaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null // null = create
  defaultProjectId?: number
}

export function TaskDialog({ open, onOpenChange, task, defaultProjectId }: TaskDialogProps) {
  const { data: session } = useSession()
  const { data: projects = [] } = useProjects()
  const { data: users = [] } = useUsers()
  const { create, update, createBacklog } = useTaskMutations()
  const [serverError, setServerError] = useState("")

  // ---- create-mode tabs ("Nova tarefa" / "Inserir backlog") + backlog state ----
  const [activeTab, setActiveTab] = useState<TaskDialogTab>("task")
  const [backlogRaw, setBacklogRaw] = useState("")
  const [backlogHelpOpen, setBacklogHelpOpen] = useState(false)
  const [backlogProjectId, setBacklogProjectId] = useState<string>("none")
  // V4-5c — a mãe nasce com a lista (DEC-82): os títulos ficam aqui até o submit. Não entram no
  // schema do react-hook-form porque não são um campo do formulário, são uma lista que o submit
  // envia junto; e o `Input` do formulário é controlado por `register`, o que não combina com
  // uma lista dinâmica.
  const [subtaskDrafts, setSubtaskDrafts] = useState<string[]>([])
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("")

  const userRoles = (session?.user as { roles?: string[] } | undefined)?.roles ?? []
  const canManageUsers = userRoles.includes("COORDENADOR") || userRoles.includes("GERENTE")
  const canSelectProject = ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"].some((r) =>
    userRoles.includes(r),
  )

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      projectId: undefined,
      assigneeIds: [],
      dueDate: "",
      priority: "medium",
      taskVisibility: "delegated",
      isGlobal: false,
      creationMode: "individual",
    },
  })

  useEffect(() => {
    if (open) {
      setServerError("")
      setActiveTab("task")
      setBacklogRaw("")
      setBacklogHelpOpen(false)
      setBacklogProjectId(defaultProjectId ? String(defaultProjectId) : "none")
      // A lista é rascunho da criação: reabrir o diálogo não pode levar a lista da tarefa anterior.
      setSubtaskDrafts([])
      setNewSubtaskTitle("")
      reset({
        title: task?.title ?? "",
        description: task?.description ?? "",
        projectId: task?.projectId?.toString() ?? defaultProjectId?.toString(),
        assigneeIds: task?.assigneeIds ?? [],
        dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : "",
        priority: task?.priority ?? "medium",
        taskVisibility: task?.taskVisibility ?? "delegated",
        isGlobal: task?.isGlobal ?? false,
        creationMode: task
          ? task.assignedTo != null && !!task.groupTaskId
            ? "individual"
            : "shared"
          : "individual",
      })
    }
  }, [open, task, defaultProjectId, reset])

  const isGlobal = watch("isGlobal")
  const selectedProjectId = watch("projectId")
  const assigneeIds = watch("assigneeIds")
  const taskVisibility = watch("taskVisibility")

  /**
   * V4-5c — o campo de subtask existe só na CRIAÇÃO e só para tarefa que suporta subtask
   * (DEC-82). `supportsSubtasks` e a MESMA funcao que o servidor usa para aceitar `subtasks` no
   * corpo — oferecer o campo para uma tarefa que o servidor recusaria e a UI mentir.
   *
   * Editar a lista de uma tarefa que ja existe e o que o dialogo de detalhe faz (DEC-89). Dois
   * controles para a mesma lista na mesma tela convidam duas regras a divergir.
   */
  const showSubtaskField = !task && supportsSubtasks(taskVisibility, isGlobal)

  const addSubtaskDraft = () => {
    const title = newSubtaskTitle.trim()
    if (!title) return
    setSubtaskDrafts((prev) => [...prev, title])
    setNewSubtaskTitle("")
  }

  // When a project is selected, fetch its members as assignee candidates.
  // Falls back to all users when no project is selected.
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)

  useEffect(() => {
    const pid = selectedProjectId ? Number(selectedProjectId) : null
    if (!pid || !Number.isInteger(pid) || pid <= 0) {
      setProjectMembers([])
      return
    }
    let cancelled = false
    setMembersLoading(true)
    listProjectMembers(pid)
      .then((members) => { if (!cancelled) setProjectMembers(members) })
      .catch(() => { if (!cancelled) setProjectMembers([]) })
      .finally(() => { if (!cancelled) setMembersLoading(false) })
    return () => { cancelled = true }
  }, [selectedProjectId])

  const memberOptions = useMemo(() => {
    if (projectMembers.length > 0) {
      // Map project members to a shape compatible with the checkbox list.
      // ProjectMember has userId + userName + userEmail; we need id + name.
      return projectMembers.map((m) => ({ id: m.userId, name: m.userName ?? m.userEmail ?? `Membro #${m.userId}` }))
    }
    // No project selected or no members — show all users as fallback.
    return users
  }, [projectMembers, users])

  const onSubmit = async (values: TaskFormValues) => {
    setServerError("")
    const parsed = taskFormSchema.parse(values)
    const body: Record<string, unknown> = {
      title: parsed.title,
      description: parsed.description || null,
      // legacy task-form parity (:199): single-create route does NOT default status
      // (only the backlog array branch does) and Prisma requires it.
      status: "to-do",
      priority: parsed.priority,
      taskVisibility: parsed.taskVisibility,
      isGlobal: parsed.isGlobal,
    }
    if (parsed.isGlobal) {
      // gateway strips these server-side; send clean payload anyway
      body.projectId = null
      body.assigneeIds = []
    } else {
      body.projectId = parsed.projectId ? Number(parsed.projectId) : null
      body.assigneeIds = parsed.assigneeIds
      if (parsed.dueDate) body.dueDate = parsed.dueDate
      if (!parsed.isGlobal && (parsed.assigneeIds?.length ?? 0) > 1) {
        body.creationMode = parsed.creationMode
      }
    }
    // V4-5c (DEC-82): a mãe nasce com a lista, no mesmo POST. So na criacao — a lista de uma
    // tarefa que ja existe e editada no dialogo de detalhe (DEC-89). O servidor aceita `subtasks`
    // no corpo de criacao (app/api/tasks/route.ts:114) e aplica a base 10 + 10·n (DEC-83).
    if (!task && subtaskDrafts.length > 0) {
      body.subtasks = subtaskDrafts.map((title) => ({ title }))
    }

    try {
      if (task) {
        await update.mutateAsync({ id: task.id, data: body })
        toast.success("Tarefa atualizada")
      } else {
        await create.mutateAsync(body)
        toast.success("Tarefa criada")
      }
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao salvar tarefa"
      setServerError(message)
      toast.error("Erro ao salvar tarefa", { description: message })
    }
  }

  // ---- backlog tab (content migrated from the former BacklogDialog) ----
  const backlogParsed = useMemo(() => parseBacklogLines(backlogRaw), [backlogRaw])
  const backlogDatesDetected = backlogParsed.filter((t) => t.dueDate).length

  const handleBacklogImport = async () => {
    if (backlogParsed.length === 0) return
    const projectId = backlogProjectId !== "none" ? Number(backlogProjectId) : null
    try {
      const result = await createBacklog.mutateAsync(
        backlogParsed.map((t) => ({
          title: t.title,
          priority: t.priority,
          dueDate: t.dueDate,
          projectId,
        })),
      )
      toast.success("Backlog importado", {
        description: `${result.createdCount} tarefa(s) criada(s).`,
      })
      onOpenChange(false)
    } catch (error) {
      toast.error("Erro ao importar backlog", {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const taskForm = (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="task-title">Título</Label>
            <Input
              id="task-title"
              placeholder="Ex.: Calibrar microscópio"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? "task-title-error" : undefined}
              {...register("title")}
            />
            {errors.title && (
              <p id="task-title-error" className="text-sm text-destructive">
                {errors.title.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Descrição</Label>
            <Textarea
              id="task-description"
              rows={3}
              placeholder="Detalhes, critérios de aceite..."
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? "task-description-error" : undefined}
              {...register("description")}
            />
            {errors.description && (
              <p id="task-description-error" className="text-sm text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          {canManageUsers && (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="task-global">Quest Global</Label>
                <p className="text-xs text-muted-foreground">
                  Visível para todo o laboratório, sem projeto. Exige MANAGE_USERS.
                </p>
              </div>
              <Switch
                id="task-global"
                checked={isGlobal}
                onCheckedChange={(checked) => setValue("isGlobal", checked)}
              />
            </div>
          )}

          {!isGlobal && (
            <>
              <div className="space-y-2">
                <Label htmlFor="task-project">Projeto</Label>
                <Select
                  value={selectedProjectId ?? "none"}
                  onValueChange={(value) =>
                    setValue("projectId", value === "none" ? undefined : value)
                  }
                >
                  <SelectTrigger id="task-project" aria-label="Projeto da tarefa">
                    <SelectValue placeholder="Sem projeto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem projeto</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Responsáveis</Label>
                <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2">
                  {memberOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum membro disponível.</p>
                  )}
                  {memberOptions.map((member) => {
                    const checked = assigneeIds?.includes(member.id) ?? false
                    return (
                      <label
                        key={member.id}
                        className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(state) => {
                            const next = new Set(assigneeIds ?? [])
                            if (state === true) next.add(member.id)
                            else next.delete(member.id)
                            setValue("assigneeIds", Array.from(next))
                          }}
                          aria-label={`Atribuir a ${member.name}`}
                        />
                        {member.name}
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="task-visibility">Visibilidade</Label>
                <Select
                  value={watch("taskVisibility")}
                  onValueChange={(value) =>
                    setValue("taskVisibility", value as TaskFormValues["taskVisibility"])
                  }
                >
                  <SelectTrigger id="task-visibility" aria-label="Visibilidade da tarefa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delegated">Delegada (responsáveis específicos)</SelectItem>
                    <SelectItem value="public">Pública (qualquer um pode pegar)</SelectItem>
                    <SelectItem value="private">Privada (restrita aos responsáveis)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!isGlobal && (assigneeIds?.length ?? 0) > 1 && (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div className="space-y-0.5">
                    <Label>Modo de atribuição</Label>
                    <p className="text-xs text-muted-foreground">
                      Individual: cada responsável recebe uma tarefa independente.
                      Compartilhado: todos compartilham o mesmo estado.
                    </p>
                  </div>
                  <Select
                    value={watch("creationMode")}
                    onValueChange={(v) => setValue("creationMode", v as "individual" | "shared")}
                  >
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="shared">Compartilhado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {showSubtaskField && (
                // V4-5c (DEC-82): a mãe nasce com a lista. Cada linha vale POINTS_PER_TASK e a
                // tarefa não entra em revisão enquanto houver subtask aberta (DEC-80) — a frase
                // está aqui porque é aqui que a pessoa decide quantas parcelas a tarefa tem.
                <div className="rounded-md border p-3">
                  <div className="flex items-center gap-1">
                    <ListTodo className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <Label>Subtasks</Label>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Cada subtask vale {POINTS_PER_TASK} pontos, pontuada pelo prazo da tarefa. A
                    tarefa não vai para revisão enquanto houver subtask aberta.
                  </p>

                  {subtaskDrafts.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {subtaskDrafts.map((title, index) => (
                        <li key={`${index}-${title}`} className="flex items-center gap-2">
                          <span className="flex-1 text-sm text-foreground/90">{title}</span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            aria-label={`Remover subtask ${title}`}
                            onClick={() =>
                              setSubtaskDrafts((prev) => prev.filter((_, i) => i !== index))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-2 flex gap-2">
                    <Input
                      aria-label="Nova subtask"
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        // Enter adiciona a linha, não envia o formulário: sem isto, a segunda
                        // subtask criada pelo teclado criaria a tarefa com uma linha só.
                        if (e.key === "Enter") {
                          e.preventDefault()
                          addSubtaskDraft()
                        }
                      }}
                      placeholder="Nova subtask"
                      maxLength={SUBTASK_TITLE_MAX_LENGTH}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addSubtaskDraft}
                      disabled={!newSubtaskTitle.trim()}
                    >
                      Adicionar subtask
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* plan-v3 OND1-D (DEC-30): o campo de pontos saiu do formulário — toda tarefa vale
              POINTS_PER_TASK e quem cria não define valor. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="task-due">Prazo</Label>
              <Input id="task-due" type="date" {...register("dueDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-priority">Prioridade</Label>
              <Select
                value={watch("priority")}
                onValueChange={(value) => setValue("priority", value as TaskFormValues["priority"])}
              >
                <SelectTrigger id="task-priority" aria-label="Prioridade da tarefa">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : task ? "Salvar" : "Criar Tarefa"}
        </Button>
      </DialogFooter>
    </form>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
          <DialogDescription>
            {task
              ? "Atualize os dados da tarefa."
              : activeTab === "backlog"
                ? "Importe várias tarefas de uma vez (uma por linha)."
                : "Crie uma nova tarefa para o quadro."}
          </DialogDescription>
        </DialogHeader>

        {task ? (
          taskForm
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TaskDialogTab)}>
            <TabsList className="w-full">
              <TabsTrigger value="task" className="flex-1">
                Nova tarefa
              </TabsTrigger>
              <TabsTrigger value="backlog" className="flex-1">
                Inserir backlog
              </TabsTrigger>
            </TabsList>

            <TabsContent value="task" className="mt-4">
              {taskForm}
            </TabsContent>

            <TabsContent value="backlog" className="mt-4 space-y-4">
              <Collapsible open={backlogHelpOpen} onOpenChange={setBacklogHelpOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" size="sm">
                    <HelpCircle className="mr-1 h-4 w-4" aria-hidden="true" />
                    Ajuda de sintaxe
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 rounded-lg border bg-muted/30 p-3 text-sm">
                  <div className="flex items-center gap-1.5 font-medium text-muted-foreground">
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                    Sintaxe — um item por linha
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span>
                      <code className="font-mono">!alta</code>{" "}
                      <code className="font-mono">!baixa</code>{" "}
                      <code className="font-mono">!urgente</code>
                    </span>
                    <span className="text-muted-foreground">prioridade (opcional)</span>
                    <span>
                      <code className="font-mono">#25/12</code>{" "}
                      <code className="font-mono">#25/12/2026</code>
                    </span>
                    <span className="text-muted-foreground">vencimento (opcional)</span>
                    <span>
                      <code className="font-mono">@30</code>
                    </span>
                    <span className="text-muted-foreground">
                      aceito e ignorado — toda tarefa vale {POINTS_PER_TASK} pontos
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => setBacklogRaw(BACKLOG_TEMPLATE)}
                  >
                    Usar modelo
                  </Button>
                </CollapsibleContent>
              </Collapsible>

              {canSelectProject && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="backlog-project">
                    Projeto
                  </label>
                  <Select value={backlogProjectId} onValueChange={setBacklogProjectId}>
                    <SelectTrigger id="backlog-project" aria-label="Selecionar projeto">
                      <SelectValue placeholder="Nenhum projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum projeto</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Textarea
                rows={8}
                value={backlogRaw}
                onChange={(e) => setBacklogRaw(e.target.value)}
                placeholder="Comprar reagentes !alta #25/12
Calibrar equipamento #15/03/2026
Testar sensor !urgente
Analisar dados !baixa #01/01
Escrever relatório !media"
                aria-label="Lista de tarefas para importação"
                className="font-mono text-sm"
              />

              <p className="text-xs text-muted-foreground" aria-live="polite">
                {backlogParsed.length} tarefa(s) detectada(s)
                {backlogDatesDetected > 0 && ` · ${backlogDatesDetected} com vencimento`}
              </p>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleBacklogImport()}
                  disabled={backlogParsed.length === 0 || createBacklog.isPending}
                >
                  <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
                  {createBacklog.isPending ? "Inserindo..." : `Inserir ${backlogParsed.length}`}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
