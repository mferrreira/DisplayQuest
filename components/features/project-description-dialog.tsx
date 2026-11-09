"use client"

import { MarkdownEditorDialog, MarkdownEditorDialogProps } from "@/components/features/markdown-editor-dialog"
import { updateProjectDescription, uploadProjectMarkdownImage } from "@/lib/api/project-files"

/**
 * ProjectDescriptionDialog — a descrição do projeto no editor de markdown com preview (S06, R10).
 *
 * S08 (DEC-263): o corpo da peça é o `MarkdownEditorDialog` generico, o mesmo da bio do perfil.
 * Esta peça fixa os rótulos e as rotas de projeto: salvar vai à rota dedicada
 * `PUT /api/projects/[id]/description` — o gate R9 (gestão OU membro ATIVO) é do servidor, e o
 * 403 que chegar é tratado como erro, não como botão desabilitado (DEC-92).
 */
interface ProjectDescriptionDialogProps {
  open: boolean
  projectId: number
  initialDescription: string
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function ProjectDescriptionDialog({ open, projectId, initialDescription, onOpenChange, onSaved }: ProjectDescriptionDialogProps) {
  const shared: MarkdownEditorDialogProps = {
    open,
    title: "Editar descrição",
    description: "Markdown simples; a preview mostra o que a tela do projeto vai renderizar.",
    label: "Descrição em markdown",
    textareaId: "project-description",
    previewTestId: "preview-de-descricao",
    inputTestId: "input-imagem-descricao",
    saveLabel: "Salvar descrição",
    initialText: initialDescription,
    onOpenChange,
    upload: (file) => uploadProjectMarkdownImage(projectId, file),
    onSave: async (text) => {
      await updateProjectDescription(projectId, text === "" ? null : text)
      onSaved?.()
    },
  }
  return <MarkdownEditorDialog {...shared} />
}
