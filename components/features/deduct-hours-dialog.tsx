"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Clock, AlertTriangle, CheckCircle } from "lucide-react"
import { fetchAPI } from "@/contexts/api-client"

interface DeductHoursDialogProps {
  userId: number
  userName: string
  currentHours: number
  projectId?: number
  onHoursDeducted?: () => void
  children: React.ReactNode
}

interface DeductHoursResponse {
  success: boolean
  message: string
}

export function DeductHoursDialog({ 
  userId, 
  userName, 
  currentHours, 
  projectId,
  onHoursDeducted,
  children 
}: DeductHoursDialogProps) {
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setSuccess("")

    try {
      const hoursNumber = parseFloat(hours)
      
      if (isNaN(hoursNumber) || hoursNumber <= 0) {
        setError("Quantidade de horas deve ser um número positivo")
        return
      }

      if (hoursNumber > currentHours) {
        setError("Usuário não possui horas suficientes")
        return
      }

      if (reason.trim() === "") {
        setError("Motivo é obrigatório")
        return
      }

      const response = await fetchAPI<DeductHoursResponse>(`/api/users/${userId}/deduct-hours`, {
        method: "POST",
        body: JSON.stringify({
          hours: hoursNumber,
          reason: reason.trim(),
          projectId
        })
      })

      if (response.success) {
        setSuccess(response.message)
        setHours("")
        setReason("")
        onHoursDeducted?.()
        
        // Fechar dialog após 2 segundos
        setTimeout(() => {
          setOpen(false)
          setSuccess("")
        }, 2000)
      }
    } catch (error: any) {
      setError(error.message || "Erro ao retirar horas")
    } finally {
      setLoading(false)
    }
  }

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setError("")
      setSuccess("")
      setHours("")
      setReason("")
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Retirar Horas Trabalhadas
          </DialogTitle>
          <DialogDescription>
            Retirar horas de <strong>{userName}</strong>
            {currentHours > 0 && (
              <span className="block text-sm text-muted-foreground mt-1">
                Horas disponíveis: <strong>{currentHours}h</strong>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="hours">Quantidade de Horas</Label>
            <Input
              id="hours"
              type="number"
              step="0.5"
              min="0.5"
              max={currentHours}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="Ex: 2.5"
              required
            />
            <p className="text-xs text-muted-foreground">
              Máximo: {currentHours}h disponíveis
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Motivo da Retirada</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explique o motivo da retirada das horas..."
              rows={3}
              required
            />
          </div>

          {currentHours === 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Este usuário não possui horas trabalhadas para retirar.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || currentHours === 0}
            >
              {loading ? "Retirando..." : "Retirar Horas"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

