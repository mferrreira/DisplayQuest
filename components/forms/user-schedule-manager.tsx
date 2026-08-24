import { Button } from "@/components/ui/button";
import { Edit, Trash2, Plus } from "lucide-react";

interface UserScheduleManagerProps {
  selectedUser: any;
  selectedUserSchedules: any[];
  openEditDialog: (schedule: any) => void;
  openCreateDialog: () => void;
  handleDeleteSchedule: (scheduleId: number) => void;
}

export function UserScheduleManager({ selectedUser, selectedUserSchedules, openEditDialog, openCreateDialog, handleDeleteSchedule }: UserScheduleManagerProps) {
  if (!selectedUser) return null;
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Horários de {selectedUser.name}</h3>
        <Button onClick={openCreateDialog} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Adicionar Horário
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
        {["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"].map((day, dayIndex) => {
          const daySchedules = selectedUserSchedules.filter(s => s.dayOfWeek === dayIndex);
          return (
            <div key={day} className="space-y-2">
              <h4 className="font-medium text-center text-sm">{day}</h4>
              <div className="space-y-1">
                {daySchedules.map((schedule) => (
                  <div key={schedule.id} className="p-2 bg-blue-50 dark:bg-info/10 dark:bg-blue-950/30 rounded text-xs relative group">
                    <div className="font-medium">{schedule.startTime} - {schedule.endTime}</div>
                    <div className="text-muted-foreground">
                      {((parseInt(schedule.endTime.split(":")[0]) * 60 + parseInt(schedule.endTime.split(":")[1])) - (parseInt(schedule.startTime.split(":")[0]) * 60 + parseInt(schedule.startTime.split(":")[1]))) / 60}h
                    </div>
                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openEditDialog(schedule)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:text-red-300" onClick={() => handleDeleteSchedule(schedule.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {daySchedules.length === 0 && (
                  <div className="text-center text-muted-foreground text-xs py-2 border border-dashed rounded">Vazio</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
} 