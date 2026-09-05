"use client"

import { useState, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Pause, Play, CheckCircle2, Trash2 } from "lucide-react"
import { useWorkSessions } from "@/contexts/work-sessions-context"
import { useToast } from "@/contexts/use-toast"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  users: any[]
  sessions: any[]
  onRefresh: () => void
}

function elapsedLabel(session: any, getElapsedSeconds: (s: any) => number) {
  const secs = getElapsedSeconds(session)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function ManageWorkSessionsDialog({ open, onOpenChange, users, sessions, onRefresh }: Props) {
  const { fetchSessions } = useWorkSessions()
  const { toast } = useToast()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [filter, setFilter] = useState<"active" | "paused" | "all">("all")

  const managed = useMemo(() => {
    const allowed = sessions.filter((s) => s.status === "active" || s.status === "paused")
    if (filter === "all") return allowed
    return allowed.filter((s) => s.status === filter)
  }, [sessions, filter])

  const { getElapsedSeconds } = useWorkSessions()

  async function act(session: any, action: "pause" | "resume" | "complete" | "delete") {
    setBusyId(session.id)
    try {
      if (action === "delete") {
        const res = await fetch(`/api/work-sessions/${session.id}`, { method: "DELETE" })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Falha ao excluir")
      } else {
        const status = action === "pause" ? "paused" : action === "resume" ? "active" : "completed"
        const res = await fetch(`/api/work-sessions/${session.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Falha ao atualizar")
      }
      toast({ title: "Sucesso", description: `Sessão ${action === "delete" ? "excluída" : "atualizada"} com sucesso.` })
      // Refresh: fetchSessions without userId fetches via MANAGE scope; fallback to onRefresh prop
      try {
        await fetch(`/api/work-sessions${filter !== "all" ? `?status=${filter}` : ""}`)
      } catch {}
      onRefresh()
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha na operação", variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar sessões (ativas e pausadas)</DialogTitle>
          <DialogDescription>
            Coordenador/Gerente pode pausar, retomar, concluir ou excluir sessões de qualquer usuário.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
            Todas
          </Button>
          <Button variant={filter === "active" ? "default" : "outline"} size="sm" onClick={() => setFilter("active")}>
            Ativas
          </Button>
          <Button variant={filter === "paused" ? "default" : "outline"} size="sm" onClick={() => setFilter("paused")}>
            Pausadas
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Usuário</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tempo</TableHead>
                <TableHead>Atividade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {managed.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma sessão {filter === "all" ? "ativa ou pausada" : filter} no momento.
                  </TableCell>
                </TableRow>
              ) : (
                managed.map((s) => {
                  const u = users.find((x) => x.id === s.userId)
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{u?.name ?? `Usuário #${s.userId}`}</div>
                        <div className="text-xs text-muted-foreground">{u?.email ?? ""}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{elapsedLabel(s, getElapsedSeconds)}</TableCell>
                      <TableCell className="text-sm truncate max-w-[160px]">{s.activity ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {s.status === "active" && (
                            <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => act(s, "pause")}>
                              <Pause className="h-3 w-3 mr-1" /> Pausar
                            </Button>
                          )}
                          {s.status === "paused" && (
                            <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => act(s, "resume")}>
                              <Play className="h-3 w-3 mr-1" /> Retomar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === s.id}
                            onClick={() => {
                              if (!confirm("Concluir esta sessão?")) return
                              act(s, "complete")
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Concluir
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={busyId === s.id}
                            onClick={() => {
                              if (!confirm("Excluir esta sessão?")) return
                              act(s, "delete")
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
