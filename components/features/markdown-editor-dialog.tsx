"use client"

import { useRef, useState } from "react"
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
import { ImagePlus, Loader2, Save } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { renderProjectMarkdown } from "@/lib/markdown-render"

/**
 * MarkdownEditorDialog — a peça única de edição de markdown com preview (S08, R12/DEC-263).
 *
 * Nasceu do dialog de descrição do projeto (S06, R10): a bio do perfil é a MESMA peça, com as
 * mesmas regras — preview pela MESMA `lib/markdown-render` da tela, imagem no cursor, drop no
 * textarea. Reescrever o editor para a bio seria a regra em duas cópias (DEC-90).
 *
 * O que o generico recebe: rótulo do textarea, testids da preview e do input de arquivo,
 * rótulo do Salvar, a função de upload (rota de projeto ou de usuário) e o `onSave` (rota
 * dedicada de cada lado). Nenhum handler async sem catch (lição do V4-4b, DEC-85).
 */
export interface MarkdownEditorDialogProps {
  open: boolean
  title: string
  description: string
  label: string
  textareaId: string
  previewTestId: string
  inputTestId: string
  saveLabel: string
  initialText: string
  onOpenChange: (open: boolean) => void
  upload: (file: File) => Promise<{ name: string; url: string }>
  onSave: (text: string) => Promise<void>
}

export function MarkdownEditorDialog({
  open,
  title,
  description,
  label,
  textareaId,
  previewTestId,
  inputTestId,
  saveLabel,
  initialText,
  onOpenChange,
  upload,
  onSave,
}: MarkdownEditorDialogProps) {
  const { toast } = useToast()
  const [text, setText] = useState(initialText)
  const [busy, setBusy] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // R11 (S07): a inserção é no cursor, não no fim. A posição é lida ANTES do upload —
  // depois do `await`, o cursor já pode ter mudado.
  async function handleImages(files: FileList | File[]) {
    const file = Array.from(files).find((item) => item.type.startsWith("image/"))
    if (!file) return
    const position = textareaRef.current?.selectionStart ?? text.length
    setBusy(true)
    try {
      const uploaded = await upload(file)
      const markdown = `![${uploaded.name}](${uploaded.url})`
      setText((current) => current.slice(0, position) + markdown + current.slice(position))
      textareaRef.current?.focus()
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao enviar a imagem",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    setBusy(true)
    try {
      await onSave(text)
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao salvar",
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor={textareaId}>{label}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Anexar imagem"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Anexar imagem
              </Button>
              <input
                ref={fileInputRef}
                data-testid={inputTestId}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => {
                  const files = event.target.files
                  if (files && files.length > 0) void handleImages(files)
                  event.target.value = ""
                }}
              />
            </div>
            <Textarea
              id={textareaId}
              ref={textareaRef}
              aria-label={label}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                const files = event.dataTransfer?.files
                if (files && files.length > 0) void handleImages(files)
              }}
              rows={12}
            />
          </div>
          <div className="grid gap-2">
            <Label>Preview</Label>
            <div
              data-testid={previewTestId}
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
            {saveLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
