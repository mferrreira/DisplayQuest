"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useLaboratorySchedule } from "@/contexts/laboratory-schedule-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/contexts/use-toast"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Calendar, Clock, Plus, Edit, Trash2, Loader2 } from "lucide-react"
import type { LaboratoryScheduleFormData } from "@/contexts/types"

const DAYS_OF_WEEK = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
]

export function LaboratorySchedule() {
  const { user } = useAuth()
  const { schedules, loading, error, createSchedule, updateSchedule, deleteSchedule } = useLaboratorySchedule()
  const { toast } = useToast()
  
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<any>(null)
  const [formData, setFormData] = useState<LaboratoryScheduleFormData>({
    dayOfWeek: 1,
    startTime: "09:00",
    endTime: "17:00",
    notes: ""
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)

  // Check if user can manage schedules
  const canManage =
    user?.roles?.includes("COORDENADOR") ||
    user?.roles?.includes("GERENTE") ||
    user?.roles?.includes("LABORATORISTA")

  const handleOpenDialog = (schedule?: any) => {
    if (schedule) {
      setEditingSchedule(schedule)
      setFormData({
        dayOfWeek: schedule.dayOfWeek,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        notes: schedule.notes || ""
      })
    } else {
      setEditingSchedule(null)
      setFormData({
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "17:00",
        notes: ""
      })
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.startTime || !formData.endTime) {
      toast({
        title: "Erro",
        description: "Horário de início e fim são obrigatórios",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSubmitting(true)
      
      if (editingSchedule) {
        await updateSchedule(editingSchedule.id, formData)
        toast({
          title: "Sucesso",
          description: "Horário atualizado com sucesso",
        })
      } else {
        await createSchedule(formData)
        toast({
          title: "Sucesso",
          description: "Horário criado com sucesso",
        })
      }
      
      setIsDialogOpen(false)
      setEditingSchedule(null)
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar horário",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteSchedule(id)
      toast({
        title: "Sucesso",
        description: "Horário removido com sucesso",
      })
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao remover horário",
        variant: "destructive",
      })
    } finally {
      setPendingDeleteId(null)
    }
  }

  const getDayLabel = (dayOfWeek: number) => {
    return DAYS_OF_WEEK.find(day => day.value === dayOfWeek)?.label || "Desconhecido"
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Horários do Laboratório
              </CardTitle>
              <CardDescription>
                Horários padrão de funcionamento do laboratório
              </CardDescription>
            </div>
            {canManage ? (
              <Button onClick={() => handleOpenDialog()}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Horário
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500 dark:text-red-400">
              {error}
            </div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4" />
              <p>Nenhum horário configurado</p>
              <p className="text-sm">Adicione horários para definir o funcionamento do laboratório</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia da Semana</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Notas</TableHead>
                  {canManage ? <TableHead>Ações</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell>
                      <Badge variant="outline">{getDayLabel(schedule.dayOfWeek)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">
                          {schedule.startTime} - {schedule.endTime}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {schedule.notes ? (
                        <span className="text-sm text-muted-foreground">{schedule.notes}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenDialog(schedule)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => setPendingDeleteId(schedule.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSchedule ? "Editar Horário" : "Adicionar Horário"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="dayOfWeek">Dia da Semana</Label>
                <Select
                  value={formData.dayOfWeek.toString()}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, dayOfWeek: parseInt(value) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((day) => (
                      <SelectItem key={day.value} value={day.value.toString()}>
                        {day.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="startTime">Horário de Início</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="endTime">Horário de Fim</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="notes">Notas (opcional)</Label>
                <Input
                  id="notes"
                  placeholder="Ex: Horário de funcionamento normal"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingSchedule ? "Atualizar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Remover horário"
        description="Tem certeza que deseja remover este horário?"
        confirmLabel="Remover"
        destructive
        onConfirm={async () => {
          if (pendingDeleteId !== null) await handleDelete(pendingDeleteId)
        }}
      />
    </>
  )
} 
