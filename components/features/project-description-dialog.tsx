"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Save } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { renderProjectMarkdown } from "@/lib/markdown-render"
import { updateProjectDescription } from "@/lib/api/project-files"

/**
 * ProjectDescriptionDialog — a peça única de edição de markdown (S06, R10).
 *
 * Textarea + preview lado a lado pela MESMA peça `lib/markdown-render` da tela do projeto:
 * reescrever a aritmética do markdown aqui seria a regra em duas cópias (DEC-90). Salvar vai à
 * rota dedicada `PUT /api/projects/[id]/description` — o gate R9 (gestão OU membro ATIVO) é do
 * servidor, e o 403 que chegar é tratado como erro, não como botão desabilitado (DEC-92).
 *
 * Nenhum handler async sem catch (lição do V4-4b, DEC-85).
 */
interface ProjectDescriptionDialogProps {
  open: boolean
  projectId: number
  initialDescription: string
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function ProjectDescriptionDialog({ open, projectId, initialDescription, onOpenChange, onSaved }: ProjectDescriptionDialogProps) {
  const { toast } = useToast()
  const [text, setText] = useState(initialDescription)
  const [busy, setBusy] = useState(false)

  async function handleSave() {
    setBusy(true)
    try {
      await updateProjectDescription(projectId, text === "" ? null : text)
      onSaved?.()
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao salvar a descrição",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar descrição</DialogTitle>
          <DialogDescription>Markdown simples; a preview mostra o que a tela do projeto vai renderizar.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="project-description">Descrição em markdown</Label>
            <Textarea
              id="project-description"
              aria-label="Descrição em markdown"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={12}
            />
          </div>
          <div className="grid gap-2">
            <Label>Preview</Label>
            <div
              data-testid="preview-de-descricao"
              className="text-muted-foreground h-72 overflow-y-auto rounded-md border p-3 text-sm [&_a]:text-primary [&_a]:underline [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_ul]:list-disc [&_ul]:pl-6"
              dangerouslySetInnerHTML={{ __html: renderProjectMarkdown(text) }}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar descrição
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
