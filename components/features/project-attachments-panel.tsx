"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import {
  deleteProjectAttachment,
  formatAttachmentSize,
  listProjectAttachments,
  projectAttachmentFileUrl,
  uploadProjectAttachment,
  type ProjectAttachment,
} from "@/lib/api/project-files"

/**
 * V5-2c (DEC-101) — anexos do projeto. O binário está no bucket; esta tela mostra o metadado
 * e aponta para a rota que serve o arquivo aplicando a regra de acesso do projeto.
 *
 * A aceitação de tipo/tamanho é a do seam (`lib/storage/blob-store.ts`): a dica abaixo é a
 * allowlist dele traduzida para o português, e o 400 que voltar é o dele.
 */
interface ProjectAttachmentsPanelProps {
  projectId: number
  canManage: boolean
}

export function ProjectAttachmentsPanel({ projectId, canManage }: ProjectAttachmentsPanelProps) {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<ProjectAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setAttachments(await listProjectAttachments(projectId))
    } catch (error) {
      setAttachments([])
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao carregar anexos",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, toast])

  useEffect(() => {
    load()
  }, [load])

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      toast({ title: "Nada para enviar", description: "Escolha um arquivo primeiro." })
      return
    }

    setBusy(true)
    try {
      const created = await uploadProjectAttachment(projectId, file)
      setAttachments((current) => [created, ...current])
      if (fileInputRef.current) fileInputRef.current.value = ""
      toast({ title: "Anexo enviado", description: created.name })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao enviar anexo",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(attachment: ProjectAttachment) {
    if (!confirm(`Excluir o anexo "${attachment.name}"?`)) return
    setBusy(true)
    try {
      await deleteProjectAttachment(projectId, attachment.id)
      setAttachments((current) => current.filter((item) => item.id !== attachment.id))
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao excluir anexo",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          Anexos
        </CardTitle>
        <CardDescription>
          {canManage
            ? "Imagem, PDF ou vídeo. O arquivo vai para o bucket de objetos do sistema."
            : "Arquivos do projeto."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-2 flex-1 min-w-[220px]">
              <label htmlFor="attachment-file" className="text-sm font-medium">
                Arquivo do anexo
              </label>
              <Input
                id="attachment-file"
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime"
                disabled={busy}
              />
            </div>
            <Button onClick={handleUpload} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Enviar anexo
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando anexos...
          </div>
        ) : attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum anexo enviado.</p>
        ) : (
          <ul className="space-y-2">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3"
              >
                <a
                  href={projectAttachmentFileUrl(projectId, attachment.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex flex-1 min-w-[180px] items-center gap-2 font-medium underline-offset-4 hover:underline"
                >
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {attachment.name}
                </a>
                <span className="text-sm text-muted-foreground">
                  {formatAttachmentSize(attachment.size)}
                </span>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(attachment)}
                    disabled={busy}
                    aria-label={`Excluir ${attachment.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
