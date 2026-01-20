"use client"

import { useState } from "react"
import { useIssues } from "@/contexts/issue-context"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, CheckCircle, Plus } from "lucide-react"

interface IssueFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

export function IssueForm({ onSuccess, onCancel }: IssueFormProps) {
  const { user } = useAuth()
  const { createIssue } = useIssues()
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high",
    category: "equipment" as "equipment" | "software" | "network" | "other"
  })
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) {
      setError("Usuário não autenticado")
      return
    }

    if (!formData.title.trim()) {
      setError("Título é obrigatório")
      return
    }

    if (!formData.description.trim()) {
      setError("Descrição é obrigatória")
      return
    }

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      await createIssue({
        title: formData.title.trim(),
        description: formData.description.trim(),
        priority: formData.priority,
        category: formData.category,
        status: "open",
        reporterId: user.id,
        assigneeId: null,
        resolution: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      setSuccess("Reclamação criada com sucesso!")
      
      // Reset form
      setFormData({
        title: "",
        description: "",
        priority: "medium",
        category: "equipment"
      })

      // Call success callback
      if (onSuccess) {
        setTimeout(() => {
          onSuccess()
        }, 1500)
      }
    } catch (err: any) {
      console.error("Erro ao criar reclamação:", err)
      setError(err.message || "Erro ao criar issue")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Plus className="h-5 w-5" />
          <span>Reportar Nova Reclamação</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1">
              Título *
            </label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleInputChange("title", e.target.value)}
              placeholder="Descreva brevemente o problema"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium mb-1">
              Descrição *
            </label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleInputChange("description", e.target.value)}
              placeholder="Descreva detalhadamente o problema, incluindo passos para reproduzir se aplicável"
              rows={4}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="priority" className="block text-sm font-medium mb-1">
                Prioridade
              </label>
              <Select 
                value={formData.priority} 
                onValueChange={(value: "low" | "medium" | "high") => 
                  handleInputChange("priority", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="category" className="block text-sm font-medium mb-1">
                Categoria
              </label>
              <Select 
                value={formData.category} 
                onValueChange={(value: "equipment" | "software" | "network" | "other") => 
                  handleInputChange("category", value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equipment">Equipamento</SelectItem>
                  <SelectItem value="software">Software</SelectItem>
                  <SelectItem value="network">Rede</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status Messages */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end space-x-2 pt-4">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancelar
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Criando..." : "Criar Reclamação"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
