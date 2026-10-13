"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Check, Loader2, Package, Pencil, Plus, Trash2, X } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import {
  createProjectDeliverable,
  deleteProjectDeliverable,
  listProjectDeliverables,
  updateProjectDeliverable,
  type ProjectDeliverable,
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
      setDeliverables(await listProjectDeliverables(projectId))
    } catch (error) {
      setDeliverables([])
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
