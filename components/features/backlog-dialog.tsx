"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useUser } from "@/contexts/user-context"
import { useProject } from "@/contexts/project-context"
import { useTask } from "@/contexts/task-context"
import { useAuth } from "@/contexts/auth-context"
import { hasAccess } from "@/lib/utils/utils"

interface BacklogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId?: string
}

export function BacklogDialog({ open, onOpenChange, projectId }: BacklogDialogProps) {
  const { users } = useUser()
  const { projects } = useProject()
  const { createBacklog } = useTask()
  const { user: currentUser } = useAuth()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [backlogText, setBacklogText] = useState("")
  const [backlogProjectId, setBacklogProjectId] = useState<string>(projectId || "")
  const [backlogAssigneeIds, setBacklogAssigneeIds] = useState<string[]>([])
  const [backlogPriority, setBacklogPriority] = useState<"low" | "medium" | "high">("medium")
  const [backlogDueDate, setBacklogDueDate] = useState("")
  const [backlogPoints, setBacklogPoints] = useState(50)
  const [backlogTaskVisibility, setBacklogTaskVisibility] = useState<"public" | "delegated" | "private">("delegated")
  const [backlogIsGlobal, setBacklogIsGlobal] = useState(false)

  const canCreateGlobal = !!currentUser && (
    currentUser.roles.includes("COORDENADOR") || currentUser.roles.includes("GERENTE")
  )

  useEffect(() => {
    if (!open) return
    setBacklogText("")
    setBacklogProjectId(projectId || "")
    setBacklogAssigneeIds(currentUser?.roles?.includes("GERENTE_PROJETO") ? [String(currentUser.id)] : [])
    setBacklogPriority("medium")
    setBacklogDueDate("")
    setBacklogPoints(50)
    setBacklogTaskVisibility("delegated")
    setBacklogIsGlobal(false)
    setError(null)
  }, [open, projectId, currentUser])

  const userOptions = useMemo(
    () =>
      users
        .filter((user) => hasAccess(user.roles || [], "COMPLETE_PUBLIC_TASKS"))
        .map((user) => ({ value: String(user.id), label: user.name })),
    [users],
  )

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: String(project.id), label: project.name })),
    [projects],
  )

  const handleSubmit = useCallback(async () => {
    try {
      setIsSubmitting(true)
      setError(null)

      const lines = backlogText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)

      if (lines.length === 0) {
        throw new Error("Informe ao menos uma task no backlog (1 por linha).")
      }

      const normalizedAssigneeIds = Array.from(
        new Set(
          backlogAssigneeIds
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0),
        ),
      )

      if (!backlogIsGlobal && !backlogProjectId) {
        throw new Error("Selecione um projeto para inserir backlog.")
      }

      if (!backlogIsGlobal && backlogTaskVisibility !== "public" && normalizedAssigneeIds.length === 0) {
        throw new Error("Selecione ao menos um responsável para tasks atribuídas/privadas.")
      }

      const tasks = lines.map((line) => {
        const [titlePart, ...descriptionParts] = line.split("|")
        const title = titlePart.trim()
        const description = descriptionParts.join("|").trim()

        return {
          title,
          description,
          status: "to-do",
          priority: backlogPriority,
          assignedTo: backlogIsGlobal ? null : (normalizedAssigneeIds[0] ?? null),
          assigneeIds: backlogIsGlobal ? [] : normalizedAssigneeIds,
          projectId: backlogIsGlobal ? null : Number(backlogProjectId),
          dueDate: backlogDueDate || null,
          points: backlogPoints,
          completed: false,
          taskVisibility: backlogIsGlobal ? "public" : backlogTaskVisibility,
          isGlobal: backlogIsGlobal,
        }
      })

      await createBacklog(tasks)
      onOpenChange(false)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erro ao criar backlog"
      setError(errorMessage)
      console.error("BacklogDialog - Error creating backlog:", err)
    } finally {
      setIsSubmitting(false)
    }
  }, [
    backlogAssigneeIds,
    backlogDueDate,
    backlogIsGlobal,
    backlogPoints,
    backlogPriority,
    backlogProjectId,
    backlogTaskVisibility,
    backlogText,
    createBacklog,
    onOpenChange,
  ])

  return (
    <Dialog open={open} onOpenChange={(newOpen) => { if (!isSubmitting) onOpenChange(newOpen) }}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh]" style={{ overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle>Inserção de Backlog</DialogTitle>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="mb-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              Cole uma task por linha. Opcionalmente use <code>Título | Descrição</code>.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Projeto</Label>
              <Select
                value={backlogProjectId}
                onValueChange={setBacklogProjectId}
                disabled={backlogIsGlobal}
              >
                <SelectTrigger>
                  <SelectValue placeholder={backlogIsGlobal ? "Não aplicável (global)" : "Selecione um projeto"} />
                </SelectTrigger>
                <SelectContent>
                  {projectOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Tipo da Task</Label>
              <Select
                value={backlogTaskVisibility}
                onValueChange={(v) => setBacklogTaskVisibility(v as "public" | "delegated" | "private")}
                disabled={backlogIsGlobal}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="delegated">Atribuída</SelectItem>
                  <SelectItem value="public">Geral (membros podem pegar)</SelectItem>
                  <SelectItem value="private">Privada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 col-span-2">
              <Label>
                Responsáveis {backlogTaskVisibility === "public" ? "(opcional)" : "(obrigatório)"}
              </Label>
              <div className={`max-h-52 overflow-y-auto rounded-md border p-2 space-y-2 ${backlogIsGlobal ? "opacity-60" : ""}`}>
                {userOptions.map((option) => {
                  const checked = backlogAssigneeIds.includes(option.value)
                  return (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={backlogIsGlobal}
                        onChange={(e) => {
                          setBacklogAssigneeIds((prev) => {
                            if (e.target.checked) return Array.from(new Set([...prev, option.value]))
                            return prev.filter((id) => id !== option.value)
                          })
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
                {userOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhum usuário elegível encontrado.</p>
                )}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Prioridade</Label>
              <Select value={backlogPriority} onValueChange={(v) => setBacklogPriority(v as "low" | "medium" | "high")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Data de vencimento</Label>
              <Input type="date" value={backlogDueDate} onChange={(e) => setBacklogDueDate(e.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label>Pontos por task</Label>
              <Input
                type="number"
                min={0}
                value={backlogPoints}
                onChange={(e) => setBacklogPoints(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {canCreateGlobal && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={backlogIsGlobal}
                onChange={(e) => {
                  setBacklogIsGlobal(e.target.checked)
                  if (e.target.checked) {
                    setBacklogTaskVisibility("public")
                    setBacklogAssigneeIds([])
                  }
                }}
              />
              Criar como Quest Global (uma por linha)
            </label>
          )}

          <div className="grid gap-2">
            <Label>Backlog (uma task por linha)</Label>
            <Textarea
              rows={10}
              value={backlogText}
              onChange={(e) => setBacklogText(e.target.value)}
              placeholder={"Ex.:\nRefatorar tela de projetos | alinhar cards e filtros\nRevisar rotas de tarefas\nCriar documentação de onboarding"}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? "Criando..." : "Criar Backlog"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
