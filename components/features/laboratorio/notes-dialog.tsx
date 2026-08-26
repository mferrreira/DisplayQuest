"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface NotesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialNotes?: string
  onSave: (notes: string) => Promise<void> | void
}

export function NotesDialog({ open, onOpenChange, initialNotes, onSave }: NotesDialogProps) {
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setNotes(initialNotes ?? "")
    }
  }, [open, initialNotes])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(notes)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Notas da Responsabilidade</DialogTitle>
        </DialogHeader>
        <Textarea
          placeholder="Adicione notas sobre esta responsabilidade..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="resize-none"
          rows={5}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
