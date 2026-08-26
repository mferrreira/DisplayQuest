"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface NoticeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (note: string) => Promise<void> | void
}

export function NoticeDialog({ open, onOpenChange, onSave }: NoticeDialogProps) {
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setNote("")
    }
  }, [open])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(note)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Aviso</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="notice-text">Aviso</Label>
            <Textarea
              id="notice-text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Escreva o aviso para o laboratório"
              rows={5}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !note.trim()}>
            Publicar aviso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
