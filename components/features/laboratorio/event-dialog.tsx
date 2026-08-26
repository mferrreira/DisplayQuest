"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultTime?: string
  onSave: (time: string, note: string) => Promise<void> | void
}

export function EventDialog({ open, onOpenChange, defaultTime, onSave }: EventDialogProps) {
  const [time, setTime] = useState("08:00")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setTime(defaultTime ?? "08:00")
      setNote("")
    }
  }, [open, defaultTime])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(time, note)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Evento</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="event-time">Horário</Label>
            <Input
              id="event-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-32"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="event-note">Descrição</Label>
            <Textarea
              id="event-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Descreva o evento"
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !note.trim() || !time}>
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
