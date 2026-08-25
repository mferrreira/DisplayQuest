"use client"

/**
 * TaskDialog (E2/T2.6) — create/edit, RHF+Zod (spec §5.2).
 * Mirrors gateway constraints: title 1–200, description ≤1000, points ≥0,
 * isGlobal requires MANAGE_USERS and disables project/assignees/visibility (gateway :86–93).
 */
import { useEffect, useMemo, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
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
import { useProjects } from "@/features/projects"
import { useUsers } from "@/features/users"
import { useTaskMutations } from "../hooks/use-tasks"
import type { Task } from "@/entities/task"

const taskFormSchema = z.object({
  title: z.string().min(1, "O título é obrigatório").max(200, "Máximo de 200 caracteres"),
  description: z.string().max(1000, "Máximo de 1000 caracteres"),
  projectId: z.string().optional(),
  assigneeIds: z.array(z.number().int()),
  dueDate: z.string().optional(),
  points: z.coerce.number().int("Pontos devem ser um número inteiro").min(0, "Pontos não podem ser negativos"),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  taskVisibility: z.enum(["public", "delegated", "private"]),
  isGlobal: z.boolean(),
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
  const { create, update } = useTaskMutations()
  const [serverError, setServerError] = useState("")

  const userRoles = (session?.user as { roles?: string[] } | undefined)?.roles ?? []
  const canManageUsers = userRoles.includes("COORDENADOR") || userRoles.includes("GERENTE")

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
      points: 10,
      priority: "medium",
      taskVisibility: "delegated",
      isGlobal: false,
    },
  })

  useEffect(() => {
    if (open) {
      setServerError("")
      reset({
        title: task?.title ?? "",
        description: task?.description ?? "",
        projectId: task?.projectId?.toString() ?? defaultProjectId?.toString(),
        assigneeIds: task?.assigneeIds ?? [],
        dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : "",
        points: task?.points ?? 10,
        priority: task?.priority ?? "medium",
        taskVisibility: task?.taskVisibility ?? "delegated",
        isGlobal: task?.isGlobal ?? false,
      })
    }
  }, [open, task, defaultProjectId, reset])

  const isGlobal = watch("isGlobal")
  const selectedProjectId = watch("projectId")
  const assigneeIds = watch("assigneeIds")

  const memberOptions = useMemo(() => {
    // Assignees come from the chosen project's membership context when possible; the users
    // list is the fallback pool (E4 replaces this with the members endpoint).
    return users
  }, [users])

  const onSubmit = async (values: TaskFormValues) => {
    setServerError("")
    const parsed = taskFormSchema.parse(values)
    const body: Record<string, unknown> = {
      title: parsed.title,
      description: parsed.description || null,
      points: parsed.points,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Editar Tarefa" : "Nova Tarefa"}</DialogTitle>
          <DialogDescription>
            {task ? "Atualize os dados da tarefa." : "Crie uma nova tarefa para o quadro."}
          </DialogDescription>
        </DialogHeader>

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
            </>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="task-due">Prazo</Label>
              <Input id="task-due" type="date" {...register("dueDate")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-points">Pontos</Label>
              <Input
                id="task-points"
                type="number"
                min={0}
                aria-invalid={Boolean(errors.points)}
                aria-describedby={errors.points ? "task-points-error" : undefined}
                {...register("points")}
              />
              {errors.points && (
                <p id="task-points-error" className="text-sm text-destructive">
                  {errors.points.message}
                </p>
              )}
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
      </DialogContent>
    </Dialog>
  )
}
