"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { badgeVariants } from "@/components/ui/badge"
import { cn } from "@/lib/utils/utils"
import { 
  Check,
  Clock, 
  Plus, 
  Trash2, 
  AlertCircle,
  Calendar,
  Users,
  X
} from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { hasPermission } from "@/lib/auth/rbac"
import { TIME_SLOTS, WEEK_DAYS, snapRange } from "@/lib/constants/schedule-grid"
import { groupSchedulesByUser, filterSchedulesByMemberIds } from "@/lib/schedule-grid-view"

function getUserColor(userId: number) {
  const colors = [
    "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-50 dark:bg-info/100/15 dark:text-blue-300 dark:border-blue-500/30",
    "bg-green-100 text-green-900 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-500/30",
    "bg-yellow-100 text-yellow-900 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/30",
    "bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30",
    "bg-pink-100 text-pink-900 border-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/30",
    "bg-cyan-100 text-cyan-900 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30",
    "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    "bg-teal-100 text-teal-900 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30",
    "bg-rose-100 text-rose-900 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  ]
  return colors[userId % colors.length]
}

/** Unique block identifier: DB id for existing, temp string for new */
interface ScheduleBlock {
  key: string
  dayOfWeek: number
  startTime: string
  endTime: string
  dbId?: number
}

let _tempId = 0
function tempKey(): string {
  return `new-${++_tempId}-${Date.now()}`
}

interface ScheduleGridProps {
  users: any[]
  readOnly?: boolean
  currentUser?: { id: number; roles?: string[] }
}

export function ScheduleGrid({ users, readOnly = false, currentUser }: ScheduleGridProps) {
  const { toast } = useToast()
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState("")
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetchSchedules()
  }, [])

  useEffect(() => {
    if (!selectedUserId) {
      setBlocks([])
      return
    }
    // Load existing schedules as blocks with DB IDs
    const userId = parseInt(selectedUserId)
    const existing = schedules
      .filter((s) => s.userId === userId)
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
    setBlocks(
      existing.map((s) => ({
        key: `db-${s.id}`,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        dbId: s.id,
      }))
    )
  }, [selectedUserId, schedules])

  const canManageAllSchedules = hasPermission(currentUser?.roles ?? [], "MANAGE_USERS")

  const fetchSchedules = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/schedules")
      const data = await response.json()
      setSchedules(data.schedules || [])
    } catch (error) {
      console.error("Erro ao buscar horários:", error)
      toast({
        title: "Erro",
        description: "Não foi possível carregar os horários.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (scheduleId: number, label?: string) => {
    if (!canManageAllSchedules) {
      toast({
        title: "Sem permissão",
        description: "Apenas coordenadores e gerentes podem remover horários.",
        variant: "destructive"
      })
      return
    }
    if (!window.confirm(`Remover este horário${label ? ` (${label})` : ""}?`)) return
    try {
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Erro ao excluir")
      }

      setSchedules(prev => prev.filter(s => s.id !== scheduleId))
      toast({
        title: "Sucesso",
        description: "Horário removido com sucesso!",
      })
    } catch (error) {
      console.error("Erro ao excluir horário:", error)
      toast({
        title: "Erro",
        description: "Não foi possível remover o horário.",
        variant: "destructive"
      })
    }
  }

  // --- Block-level operations (multi-block per day) ---

  const addBlock = (dayIdx: number) => {
    setBlocks(prev => [
      ...prev,
      { key: tempKey(), dayOfWeek: dayIdx, startTime: "09:00", endTime: "09:30" },
    ])
  }

  const removeBlock = (key: string) => {
    setBlocks(prev => prev.filter((b) => b.key !== key))
  }

  const updateBlockTime = (key: string, field: "startTime" | "endTime", value: string) => {
    setBlocks(prev => prev.map((b) => (b.key === key ? { ...b, [field]: value } : b)))
  }

  const handleSave = async () => {
    if (!canManageAllSchedules) {
      toast({
        title: "Sem permissão",
        description: "Apenas coordenadores e gerentes podem definir horários.",
        variant: "destructive"
      })
      return
    }
    setSaving(true)
    setError("")
    
    if (!selectedUserId || isNaN(parseInt(selectedUserId))) {
      toast({
        title: "Erro",
        description: "Selecione um usuário válido.",
        variant: "destructive"
      })
      setSaving(false)
      return
    }

    try {
      // Atomic replace: one PUT replaces all schedules for this user
      const response = await fetch("/api/schedules/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: parseInt(selectedUserId),
          slots: blocks.map((b) => ({
            dayOfWeek: b.dayOfWeek,
            ...snapRange({ startTime: b.startTime, endTime: b.endTime }),
          })),
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || "Erro ao salvar horários")
      }

      await fetchSchedules()
      setDialogOpen(false)
      setSelectedUserId("")
      setBlocks([])
      
      toast({
        title: "Sucesso",
        description: "Horários salvos com sucesso!",
      })
    } catch (error) {
      console.error("Erro ao salvar horários:", error)
      toast({
        title: "Erro",
        description: "Erro ao salvar horários. Tente novamente.",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const toggleUser = (userId: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
  }

  const clearSelection = () => setSelectedUserIds(new Set())

  const selectedUser = users.find(u => u.id === parseInt(selectedUserId))
  const visibleSlots = TIME_SLOTS
  const visibleSchedules: any[] = filterSchedulesByMemberIds(schedules, selectedUserIds)
  const mobileGroups = groupSchedulesByUser(visibleSchedules, users)
  const totalScheduledMinutes = blocks.reduce((sum, b) => {
    const [sh, sm] = b.startTime.split(":").map(Number)
    const [eh, em] = b.endTime.split(":").map(Number)
    return sum + ((eh * 60 + em) - (sh * 60 + sm))
  }, 0)
  const totalScheduledHours = totalScheduledMinutes / 60
  const requiredHours = selectedUser?.weekHours || 0
  const activeUsers = users.filter((user) => user.status === "active")

  // Group blocks by day for the dialog
  const blocksByDay = WEEK_DAYS.map((_, idx) =>
    blocks.filter((b) => b.dayOfWeek === idx)
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Grade Semanal de Horários
        </CardTitle>
        <CardDescription>
          Visualize os horários dos usuários no laboratório. Apenas coordenadores e gerentes podem definir horários.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {schedules.length} horários cadastrados
            </span>
          </div>
          {!readOnly && canManageAllSchedules && (
            <Button
              onClick={() => setDialogOpen(true)}
              variant="outline"
              size="sm"
              disabled={!currentUser}
            >
              <Plus className="h-4 w-4 mr-2" />
              Definir Horários
            </Button>
          )}
        </div>

        <div className="mb-4 rounded-lg border bg-muted/20 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4" />
              Membros visiveis na grade
            </div>
            {selectedUserIds.size > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={clearSelection}
                title="Voltar a mostrar todos os horários"
              >
                <X className="mr-1 h-3 w-3" />
                Limpar seleção
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {activeUsers.map((user) => {
              const hasAnySchedule = schedules.some((schedule) => schedule.userId === user.id)
              const isSelected = selectedUserIds.has(user.id)
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggleUser(user.id)}
                  aria-pressed={isSelected}
                  className={cn(
                    badgeVariants({ variant: isSelected ? "success" : "outline" }),
                    "cursor-pointer gap-1 transition-colors",
                    !isSelected && "hover:bg-accent hover:text-accent-foreground",
                  )}
                  title={isSelected ? `Ocultar ${user.name}` : `Mostrar apenas ${user.name}`}
                >
                  {isSelected && <Check className="h-3 w-3" />}
                  <span>{user.name}</span>
                  {!hasAnySchedule ? <span className="text-[10px]">(sem horario)</span> : null}
                </button>
              )
            })}
          </div>
        </div>

        {/* Dialog para definir horários */}
        {!readOnly && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl sm:overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Definir Horários do Usuário</DialogTitle>
              <DialogDescription>
                Configure os dias e horários em que o usuário deve estar no laboratório.
                Cada dia pode ter múltiplos blocos (ex: 07:30–12:00 e 15:30–17:00).
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Selecionar Usuário</label>
                <Select 
                  value={selectedUserId} 
                  onValueChange={setSelectedUserId}
                  disabled={!canManageAllSchedules}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    {users
                      .filter(u => u.status === 'active')
                      .map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>

              {selectedUserId && (
                <div className="space-y-3">
                  <div className="font-medium">Dias da Semana</div>
                  <div className="grid grid-cols-1 gap-3">
                    {WEEK_DAYS.map((day, idx) => {
                      const dayBlocks = blocksByDay[idx]
                      const hasBlocks = dayBlocks.length > 0
                      return (
                        <div key={day} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{day}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => addBlock(idx)}
                            >
                              <Plus className="mr-1 h-3 w-3" />
                              Adicionar bloco
                            </Button>
                          </div>

                          {hasBlocks ? (
                            <div className="space-y-2">
                              {dayBlocks.map((block) => (
                                <div key={block.key} className="flex items-center gap-2">
                                  <Input
                                    type="time"
                                    step={1800}
                                    value={block.startTime}
                                    onChange={(e) => updateBlockTime(block.key, "startTime", e.target.value)}
                                    className="w-32"
                                    aria-label={`Início ${day}`}
                                  />
                                  <span className="text-muted-foreground">até</span>
                                  <Input
                                    type="time"
                                    step={1800}
                                    value={block.endTime}
                                    onChange={(e) => updateBlockTime(block.key, "endTime", e.target.value)}
                                    className="w-32"
                                    aria-label={`Fim ${day}`}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                                    onClick={() => removeBlock(block.key)}
                                    title="Remover este bloco"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Nenhum horário</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {selectedUser && (
                <div className="p-3 bg-blue-50 dark:bg-info/10 rounded-lg">
                  <div className="text-sm">
                    <span className="font-medium">Horas semanais obrigatórias:</span> {requiredHours.toFixed(1)}h
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Horas agendadas:</span> {totalScheduledHours.toFixed(2)}h
                  </div>
                  
                  {totalScheduledHours < requiredHours && (
                    <div className="mt-2 flex items-center gap-2 text-yellow-800 dark:text-yellow-300 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      <span>O total de horas agendadas está abaixo do mínimo semanal para este usuário.</span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSave} 
                  disabled={!selectedUserId || blocks.length === 0 || saving}
                >
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        )}

        {/* Grade de horários */}
        <div className="overflow-x-auto max-w-full">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">
              <Clock className="h-8 w-8 mx-auto mb-2 animate-spin" />
              Carregando horários...
            </div>
          ) : schedules.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
              Nenhum horário cadastrado.
              {!readOnly && canManageAllSchedules && (
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} disabled={!currentUser}>
                    <Plus className="h-4 w-4 mr-2" />
                    Definir Horários
                  </Button>
                </div>
              )}
            </div>
          ) : visibleSchedules.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
              Nenhum horário para os membros selecionados.
            </div>
          ) : (
            <>
              {/* Visão compacta mobile */}
              <div className="md:hidden space-y-3">
                {mobileGroups.map((group) => (
                  <div key={group.userId} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2 font-medium">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${getUserColor(group.userId).split(" ")[0]}`} />
                      {group.userName}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {group.entries
                        .map((entry) => `${WEEK_DAYS[entry.dayOfWeek] ?? "Dia"} ${entry.timeRange}`)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>

              {/* Tabela desktop */}
              <div className="hidden md:block">
            <table className="w-full border text-xs" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th className="px-2 py-1.5 border-b bg-blue-50 dark:bg-info/10 text-left font-medium text-[11px]">Horário</th>
                  {WEEK_DAYS.map((day) => (
                    <th key={day} className="px-2 py-1.5 border-b bg-blue-50 dark:bg-info/10 text-center font-medium text-[11px]">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleSlots.map((slot) => (
                  <tr key={slot.start + slot.end}>
                    <td className="px-1.5 py-1.5 border-r text-right align-middle whitespace-nowrap border-b-2 font-medium text-[11px]">
                      {slot.start}<br />{slot.end}
                    </td>
                    {WEEK_DAYS.map((_, dayIdx) => {
                      const slotSchedules = visibleSchedules.filter((s) => {
                        if (s.dayOfWeek !== dayIdx) return false
                        return s.startTime < slot.end && s.endTime > slot.start
                      })
                      
                      return (
                        <td key={dayIdx} className="px-1.5 py-1.5 border align-top">
                          {slotSchedules.length === 0 ? (
                            <span className="text-muted-foreground text-center block">-</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              {slotSchedules.map((s) => {
                                const user = users.find((u) => u.id === s.userId)
                                return (
                                  <div
                                    key={s.id}
                                    className={`group rounded border px-2 py-1 text-xs font-medium ${getUserColor(s.userId)} flex items-center justify-between gap-1`}
                                  >
                                    <span className="truncate">{user?.name || "Usuário"}</span>
                                    <span className="ml-1 text-[10px] text-muted-foreground">
                                      ({s.startTime} - {s.endTime})
                                    </span>
                                    {!readOnly && canManageAllSchedules && (
                                      <button
                                        onClick={() => handleDelete(s.id, `${user?.name || "Usuário"} ${s.startTime}-${s.endTime}`)}
                                        className="opacity-0 group-hover:opacity-100 text-red-500 dark:text-red-400 hover:text-red-700 transition-opacity"
                                        title="Remover"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
