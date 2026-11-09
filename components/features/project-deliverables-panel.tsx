"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Check, FileText, Loader2, Package, Pencil, Plus, Trash2, X } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import {
  createProjectDeliverable,
  deleteProjectDeliverable,
  deleteProjectDeliverableFile,
  formatAttachmentSize,
  listProjectDeliverables,
  listProjectDeliverableFiles,
  projectDeliverableFileUrl,
  updateProjectDeliverable,
  uploadProjectDeliverableFile,
  type ProjectDeliverable,
  type ProjectDeliverableFile,
} from "@/lib/api/project-files"

/**
 * V5-2c — entregáveis do projeto: a lista do que o projeto entrega, em (nome, quantidade).
 *
 * Quem pode escrever é decidido pelo servidor (gate de gestão do projeto, DEC-92): `canManage`
 * controla apenas quais controles aparecem na tela. Um 403 que chegar mesmo assim é tratado
 * como erro, não como botão desabilitado.
 */
interface ProjectDeliverablesPanelProps {
  projectId: number
  canManage: boolean
}

export function ProjectDeliverablesPanel({ projectId, canManage }: ProjectDeliverablesPanelProps) {
  const { toast } = useToast()
  const [deliverables, setDeliverables] = useState<ProjectDeliverable[]>([])
  const [filesByDeliverable, setFilesByDeliverable] = useState<Record<number, ProjectDeliverableFile[]>>({})
  const [selectedFile, setSelectedFile] = useState<Record<number, File | null>>({})
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState("")
  const [newQuantity, setNewQuantity] = useState("1")
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState("")
  const [editQuantity, setEditQuantity] = useState("1")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listProjectDeliverables(projectId)
      setDeliverables(rows)
      // S02: os arquivos são leitura aberta (DEC-136); uma leitura por entregável.
      const files = await Promise.all(rows.map((row) => listProjectDeliverableFiles(projectId, row.id)))
      const map: Record<number, ProjectDeliverableFile[]> = {}
      rows.forEach((row, index) => {
        map[row.id] = files[index]
      })
      setFilesByDeliverable(map)
    } catch (error) {
      setDeliverables([])
      setFilesByDeliverable({})
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao carregar entregáveis",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [projectId, toast])

  useEffect(() => {
    load()
  }, [load])

  // Nenhum handler async sem catch: rejeição solta em `onClick` derruba o gate do Vitest com
  // "Unhandled Rejection" mesmo com todos os testes passando (medido no V4-4b, DEC-85).
  async function handleCreate() {
    setBusy(true)
    try {
      const created = await createProjectDeliverable(projectId, {
        name: newName,
        quantity: newQuantity === "" ? undefined : Number(newQuantity),
      })
      setDeliverables((current) => [...current, created])
      setNewName("")
      setNewQuantity("1")
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao criar entregável",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  function startEditing(deliverable: ProjectDeliverable) {
    setEditingId(deliverable.id)
    setEditName(deliverable.name)
    setEditQuantity(String(deliverable.quantity))
  }

  async function handleSaveEdit(deliverableId: number) {
    setBusy(true)
    try {
      const updated = await updateProjectDeliverable(projectId, deliverableId, {
        name: editName,
        quantity: Number(editQuantity),
      })
      setDeliverables((current) => current.map((item) => (item.id === deliverableId ? updated : item)))
      setEditingId(null)
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao atualizar entregável",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(deliverable: ProjectDeliverable) {
    if (!confirm(`Excluir o entregável "${deliverable.name}"?`)) return
    setBusy(true)
    try {
      await deleteProjectDeliverable(projectId, deliverable.id)
      setDeliverables((current) => current.filter((item) => item.id !== deliverable.id))
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao excluir entregável",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  // S02: o botão envia o arquivo escolhido NA LINHA dele. O `accept` é o do seam — a recusa de
  // tipo/magic bytes é da rota, e o 400 que voltar é o dela (mesma divisão da tela de anexos).
  async function handleUploadFile(deliverable: ProjectDeliverable) {
    const file = fileInputRefs.current[deliverable.id]?.files?.[0]
    if (!file) {
      toast({ title: "Nada para enviar", description: "Escolha um arquivo primeiro." })
      return
    }

    setBusy(true)
    try {
      const created = await uploadProjectDeliverableFile(projectId, deliverable.id, file)
      setFilesByDeliverable((current) => ({
        ...current,
        [deliverable.id]: [created, ...(current[deliverable.id] ?? [])],
      }))
      setSelectedFile((current) => ({ ...current, [deliverable.id]: null }))
      if (fileInputRefs.current[deliverable.id]) {
        fileInputRefs.current[deliverable.id]!.value = ""
      }
      toast({ title: "Arquivo enviado", description: created.name })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao enviar arquivo do entregável",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  // S03: a gestão remove o arquivo da linha. A confirmação é a mesma régua da exclusão do
  // entregável; a linha do entregável fica, só o arquivo sai.
  async function handleDeleteFile(deliverable: ProjectDeliverable, file: ProjectDeliverableFile) {
    if (!confirm(`Remover o arquivo "${file.name}"?`)) return
    setBusy(true)
    try {
      await deleteProjectDeliverableFile(projectId, deliverable.id, file.id)
      setFilesByDeliverable((current) => ({
        ...current,
        [deliverable.id]: (current[deliverable.id] ?? []).filter((item) => item.id !== file.id),
      }))
      toast({ title: "Arquivo removido", description: file.name })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao remover arquivo do entregável",
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
          <Package className="h-5 w-5" />
          Entregáveis
        </CardTitle>
        <CardDescription>O que o projeto se compromete a entregar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-2 flex-1 min-w-[200px]">
              <Label htmlFor="deliverable-name">Nome do entregável</Label>
              <Input
                id="deliverable-name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Ex.: Relatório parcial"
              />
            </div>
            <div className="grid gap-2 w-24">
              <Label htmlFor="deliverable-quantity">Unidades</Label>
              <Input
                id="deliverable-quantity"
                type="number"
                min={1}
                max={999}
                value={newQuantity}
                onChange={(event) => setNewQuantity(event.target.value)}
              />
            </div>
            <Button onClick={handleCreate} disabled={busy || newName.trim() === ""}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {/* O nome do controle nomeia o que ele adiciona: o diálogo de detalhe também monta o
                  painel de membros, que tem um "Adicionar" próprio, e `getByRole` casa por
                  substring (lição da 3.C). */}
              Adicionar entregável
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando entregáveis...
          </div>
        ) : deliverables.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum entregável cadastrado.</p>
        ) : (
          <ul className="space-y-2">
            {deliverables.map((deliverable) => (
              <li
                key={deliverable.id}
                className="flex flex-wrap items-center gap-2 rounded-md border p-3"
              >
                {editingId === deliverable.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      className="flex-1 min-w-[180px]"
                      // Rótulos da edição deliberadamente diferentes dos do cadastro: `getByLabel`
                      // casa por substring, e "Nome do entregável" dentro de "Nome do entregável em
                      // edição" faria um teste achar dois campos (lição da 3.C).
                      aria-label="Novo nome"
                    />
                    <Input
                      type="number"
                      min={1}
                      max={999}
                      value={editQuantity}
                      onChange={(event) => setEditQuantity(event.target.value)}
                      className="w-24"
                      aria-label="Nova quantidade"
                    />
                    <Button size="sm" onClick={() => handleSaveEdit(deliverable.id)} disabled={busy}>
                      <Check className="h-4 w-4" />
                      Salvar entregável
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                      disabled={busy}
                    >
                      <X className="h-4 w-4" />
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 min-w-[180px] font-medium">{deliverable.name}</span>
                    <Badge variant="secondary">{deliverable.quantity} un.</Badge>
                    {canManage && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEditing(deliverable)}
                          disabled={busy}
                          aria-label={`Editar ${deliverable.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(deliverable)}
                          disabled={busy}
                          aria-label={`Excluir ${deliverable.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {/* S02: os arquivos do entregável. A leitura é aberta (DEC-136); o envio é da
                        gestão. Rótulos da casa: `getByLabel` casa por substring, então o campo é
                        "Arquivo para X" e o botão "Enviar arquivo X" — os dois não se sobrepõem. */}
                    <div className="w-full mt-2 space-y-2 border-t pt-2">
                      {(filesByDeliverable[deliverable.id] ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum arquivo enviado.</p>
                      ) : (
                        <ul className="space-y-1">
                          {(filesByDeliverable[deliverable.id] ?? []).map((file) => (
                            <li key={file.id} className="flex flex-wrap items-center gap-2">
                              <a
                                href={projectDeliverableFileUrl(projectId, deliverable.id, file.id)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex flex-1 min-w-[180px] items-center gap-2 font-medium underline-offset-4 hover:underline"
                              >
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                {file.name}
                              </a>
                              <span className="text-sm text-muted-foreground">
                                {formatAttachmentSize(file.size)}
                              </span>
                              {canManage && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteFile(deliverable, file)}
                                  disabled={busy}
                                  aria-label={`Remover arquivo ${file.name}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {canManage && (
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="grid gap-1 flex-1 min-w-[220px]">
                            <Label htmlFor={`deliverable-file-${deliverable.id}`} className="text-sm font-medium">
                              Arquivo para {deliverable.name}
                            </Label>
                            <Input
                              id={`deliverable-file-${deliverable.id}`}
                              ref={(node) => {
                                fileInputRefs.current[deliverable.id] = node
                              }}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,video/mp4,video/webm,video/quicktime"
                              disabled={busy}
                              onChange={(event) =>
                                setSelectedFile((current) => ({
                                  ...current,
                                  [deliverable.id]: event.target.files?.[0] ?? null,
                                }))
                              }
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleUploadFile(deliverable)}
                            disabled={busy || !selectedFile[deliverable.id]}
                            aria-label={`Enviar arquivo ${deliverable.name}`}
                          >
                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                            Enviar arquivo {deliverable.name}
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
