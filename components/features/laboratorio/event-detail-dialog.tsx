"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { LabEvent } from "@/entities/lab"

interface EventDetailDialogProps {
  event: LabEvent | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canEdit?: boolean
  onEdit?: (event: LabEvent) => void
}

export function EventDetailDialog({ event, open, onOpenChange, canEdit = false, onEdit }: EventDetailDialogProps) {
  if (!event) return null

  const date = new Date(event.date)
  const createdAt = event.createdAt ? new Date(event.createdAt) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Detalhes do evento</DialogTitle>
          <DialogDescription>
            {format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <span className="text-xs font-medium text-muted-foreground">Horário</span>
            <p className="font-mono text-base">{format(date, "HH:mm")}</p>
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground">Descrição</span>
            <p className="whitespace-pre-wrap text-sm text-foreground">{event.note}</p>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Por {event.userName || "Usuário"}</p>
            {createdAt ? <p>Criado em {format(createdAt, "dd/MM/yyyy 'às' HH:mm")}</p> : null}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {canEdit && onEdit ? (
            <Button onClick={() => onEdit(event)}>Editar</Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}