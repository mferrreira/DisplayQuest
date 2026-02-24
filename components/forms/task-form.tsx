"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import type { Task, TaskFormData, User, Project } from "@/contexts/types"
import { hasAccess } from "@/lib/utils/utils"

interface TaskFormProps {
  task?: Task | null
  users: User[]
  projects: Project[]
  currentUser: User | null
  onSubmit: (formData: TaskFormData) => Promise<void>
  onCancel: () => void
  isSubmitting: boolean
  error: string | null
  projectId?: string
  open?: boolean // Add open prop
}

/**
 * Form field component for basic input fields
 */
interface FormFieldProps {
  label: string
  id: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  required?: boolean
  placeholder?: string
  type?: string
  min?: string | number
  rows?: number
  error?: string
}

/**
 * Number input field component
 */
interface NumberFieldProps {
  label: string
  id: string
  name: string
  value: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  min?: number
  disabled?: boolean
  helperText?: string
}

function FormField({ 
  label, 
  id, 
  name, 
  value, 
  onChange, 
  required = false, 
  placeholder, 
  type = "text",
  min,
  rows,
  error
}: FormFieldProps) {
  const InputComponent = rows ? Textarea : Input
  const inputProps = rows ? { rows } : { type, min }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}{required && " *"}</Label>
      <InputComponent
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        {...inputProps}
      />
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}

function NumberField({ 
  label, 
  id, 
  name, 
  value, 
  onChange, 
  min,
  disabled = false,
  helperText
}: NumberFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="number"
        min={min}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={disabled ? "bg-gray-100 cursor-not-allowed" : ""}
      />
      {helperText && (
        <p className="text-xs text-gray-600 dark:text-gray-400">{helperText}</p>
      )}
    </div>
  )
}

/**
 * Select field component for dropdown selections
 */
interface SelectFieldProps {
  label: string
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  options: Array<{ value: string; label: string }>
  error?: string
  disabled?: boolean
}

function SelectField({ label, value, onValueChange, placeholder, options, error, disabled = false }: SelectFieldProps) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger className={disabled ? "bg-gray-100 cursor-not-allowed" : ""}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}

/**
 * Form actions component for submit and cancel buttons
 */
interface FormActionsProps {
  isSubmitting: boolean
  onCancel: () => void
  isEdit: boolean
}

function FormActions({ isSubmitting, onCancel, isEdit }: FormActionsProps) {
  return (
    <div className="flex justify-end space-x-2 pt-4">
      <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
        Cancelar
      </Button>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Salvando..." : isEdit ? "Atualizar" : "Criar"}
      </Button>
    </div>
  )
}

/**
 * Main TaskForm component
 */
export function TaskForm({
  task,
  users,
  projects,
  currentUser,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  projectId,
  open,
}: TaskFormProps) {
  const [formData, setFormData] = useState<TaskFormData>({
    title: "",
    description: "",
    status: "to-do",
    priority: "medium",
    assignedTo: "",
    project: "",
    dueDate: "",
    points: 50, // Default para medium priority
    completed: false,
    taskVisibility: "delegated",
    isGlobal: false,
  })
  const [isPastDate, setIsPastDate] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({})

  const checkIfPastDate = useCallback((dateString: string | null) => {
    if (!dateString) {
      setIsPastDate(false)
      return
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selectedDate = new Date(dateString)
    setIsPastDate(selectedDate < today)
  }, [])

  // Sistema de pontuação baseado em prioridade
  const PRIORITY_POINTS = {
    'low': 25,
    'medium': 50,
    'high': 100,
    'urgent': 150
  } as const;

  // Verificar se usuário pode definir pontos customizados
  const canSetCustomPoints = currentUser && (
    currentUser.roles.includes('COORDENADOR') || 
    currentUser.roles.includes('GERENTE')
  );

  // Atualizar pontos quando prioridade mudar (apenas para usuários não-coordenadores/gerentes)
  useEffect(() => {
    if (!canSetCustomPoints) {
      const priorityPoints = PRIORITY_POINTS[formData.priority];
      setFormData(prev => ({ ...prev, points: priorityPoints }));
    }
  }, [formData.priority, canSetCustomPoints]);

  // Reset form when task changes
  useEffect(() => {
    if (task) {
      const formDataToSet = {
        title: task.title,
        description: task.description || "",
        status: (task.status as TaskFormData["status"]) || "to-do",
        priority: (task.priority as TaskFormData["priority"]) || "medium",
        assignedTo: task.assignedTo?.toString() || "",
        project: task.projectId?.toString() || "",
        dueDate: task.dueDate || "",
        points: task.points,
        completed: task.completed || false,
        taskVisibility: (task.taskVisibility as TaskFormData["taskVisibility"]) || "delegated",
      }
      setFormData(formDataToSet)
      checkIfPastDate(task.dueDate || null)
    } else {
      setFormData({
        title: "",
        description: "",
        status: "to-do",
        priority: "medium",
        assignedTo: currentUser?.roles?.includes("GERENTE_PROJETO") ? currentUser.id.toString() : "",
        project: projectId || "",
        dueDate: "",
        points: 10,
        completed: false,
        taskVisibility: "delegated",
        isGlobal: false,
      })
      setIsPastDate(false)
    }
    setFieldErrors({})
  }, [task, currentUser, projectId, checkIfPastDate, users, projects, open])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === "dueDate") {
      checkIfPastDate(value)
    }
    setFormData((prev) => ({ ...prev, [name]: value }))
  }, [checkIfPastDate])

  const handleSelectChange = useCallback((name: string, value: string) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
  }, [])

  const handleNumberChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: parseInt(value) || 0 }))
  }, [])

  const handleCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target
    setFormData((prev) => ({ ...prev, [name]: checked }))
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    // Validation
    const errors: { [key: string]: string } = {}
    if (!formData.title.trim()) errors.title = "Título é obrigatório."
    
    // For global quests, assignedTo and project are not required
    if (!formData.isGlobal) {
      if (!formData.project) errors.project = "Selecione um projeto."
      if (formData.taskVisibility !== "public" && !formData.assignedTo) {
        errors.assignedTo = "Selecione um responsável para tarefa atribuída."
      }
    }
    
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return
    onSubmit(formData)
  }, [formData, onSubmit])

  // Options for select fields
  const statusOptions = [
    { value: "to-do" as const, label: "A Fazer" },
    { value: "in-progress" as const, label: "Em Andamento" },
    { value: "in-review" as const, label: "Em Revisão" },
    { value: "adjust" as const, label: "Ajustes" },
    { value: "done" as const, label: "Concluído" },
  ]
  const priorityOptions = [
    { value: "low" as const, label: "Baixa" },
    { value: "medium" as const, label: "Média" },
    { value: "high" as const, label: "Alta" },
  ]
  const visibilityOptions = [
    { value: "delegated", label: "Atribuída" },
    { value: "public", label: "Geral (membros podem pegar)" },
    { value: "private", label: "Privada" },
  ]
  // Only show volunteers for task delegation
  const userOptions = users
    .filter((user) => hasAccess(user.roles || [], 'COMPLETE_PUBLIC_TASKS'))
    .map((user) => ({
      value: user.id.toString(),
      label: user.name,
    }))
  const projectOptions = projects.map((project) => ({
    value: project.id.toString(),
    label: project.name,
  }))

  // Delay rendering if editing a task and options are not loaded
  if (task && (users.length === 0 || projects.length === 0)) {
    return <div className="p-6 text-center text-muted-foreground">Carregando opções...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <FormField
        label="Título"
        id="title"
        name="title"
        value={formData.title}
        onChange={handleChange}
        required
        placeholder="Digite o título da tarefa"
        error={fieldErrors.title}
      />
      <FormField
        label="Descrição"
        id="description"
        name="description"
        value={formData.description}
        onChange={handleChange}
        placeholder="Digite a descrição da tarefa"
        rows={3}
      />
      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Status"
          value={formData.status}
          onValueChange={(value) => handleSelectChange("status", value)}
          options={statusOptions}
          error={fieldErrors.status}
        />
        <SelectField
          label="Prioridade"
          value={formData.priority}
          onValueChange={(value) => handleSelectChange("priority", value)}
          options={priorityOptions}
        />
      </div>

      {!formData.isGlobal && (
        <SelectField
          label="Tipo da Task"
          value={formData.taskVisibility || "delegated"}
          onValueChange={(value) => handleSelectChange("taskVisibility", value)}
          options={visibilityOptions}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Projeto"
          value={formData.project}
          onValueChange={(value) => handleSelectChange("project", value)}
          placeholder={formData.isGlobal ? "Não aplicável para quest global" : "Selecione um projeto"}
          options={projectOptions}
          error={fieldErrors.project}
          disabled={formData.isGlobal}
        />
        <SelectField
          label="Responsável"
          value={formData.assignedTo}
          onValueChange={(value) => handleSelectChange("assignedTo", value)}
          placeholder={
            formData.isGlobal
              ? "Não aplicável para quest global"
              : (formData.taskVisibility === "public"
                ? "Opcional para task geral"
                : "Selecione um responsável")
          }
          options={userOptions}
          error={fieldErrors.assignedTo}
          disabled={formData.isGlobal}
        />
      </div>
      {!formData.isGlobal && formData.taskVisibility === "public" && (
        <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
          ℹ️ Tasks gerais ficam visíveis para membros do projeto e podem ser assumidas ao serem movidas no quadro.
        </p>
      )}
      {formData.isGlobal && (
        <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
          ℹ️ Quest globais não precisam de projeto ou responsável específico - são visíveis para todos os usuários.
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Data de Vencimento"
          id="dueDate"
          name="dueDate"
          value={formData.dueDate}
          onChange={handleChange}
          type="date"
          error={isPastDate ? "A data selecionada já passou" : undefined}
        />
        <NumberField
          label={canSetCustomPoints ? "Pontos (Personalizado)" : "Pontos (Baseado na Prioridade)"}
          id="points"
          name="points"
          value={formData.points}
          onChange={handleNumberChange}
          min={0}
          disabled={!canSetCustomPoints}
          helperText={!canSetCustomPoints ? `Pontos automáticos: ${PRIORITY_POINTS[formData.priority]} (${formData.priority})` : "Defina a pontuação personalizada"}
        />
      </div>

      {/* Quest Global Checkbox - Only show for managers and coordinators */}
      {currentUser && (currentUser.roles.includes('GERENTE') || currentUser.roles.includes('COORDENADOR')) && (
        <div className="space-y-4 p-4 border rounded-lg bg-blue-50">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isGlobal"
              name="isGlobal"
              checked={formData.isGlobal || false}
              onChange={handleCheckboxChange}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="isGlobal" className="text-sm font-medium text-blue-900">
              Quest Global
            </label>
          </div>
          <p className="text-xs text-blue-700">
            Quest globais são visíveis para todos os usuários e não precisam de responsável específico.
          </p>
        </div>
      )}
      <FormActions
        isSubmitting={isSubmitting}
        onCancel={onCancel}
        isEdit={!!task}
      />
    </form>
  )
} 
