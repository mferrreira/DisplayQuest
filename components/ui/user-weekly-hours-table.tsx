import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useState, useEffect } from "react";
import type { User, WorkSession } from "@/contexts/types";

interface UserWeeklyHoursTableProps {
  users: User[];
  sessions: WorkSession[];
}

interface WeeklyHistory {
  userId: number;
  userName: string;
  totalHours: number;
  weekStart: string;
  weekEnd: string;
}

export function UserWeeklyHoursTable({ users, sessions }: UserWeeklyHoursTableProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    // Inicializar com a segunda-feira da semana atual
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });
  
  const [weeklyHistory, setWeeklyHistory] = useState<WeeklyHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [isCurrentWeek, setIsCurrentWeek] = useState(true);

  // Verificar se a semana selecionada é a atual
  useEffect(() => {
    const today = new Date();
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    currentMonday.setHours(0, 0, 0, 0);
    
    setIsCurrentWeek(
      currentWeekStart.getTime() === currentMonday.getTime()
    );
  }, [currentWeekStart]);

  // Fetch weekly history when week changes
  useEffect(() => {
    const fetchWeeklyHistory = async () => {
      if (isCurrentWeek) {
        setWeeklyHistory([]);
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(`/api/weekly-hours-history?weekStart=${currentWeekStart.toISOString()}`);
        const data = await response.json();
        
        // Se não há histórico para esta semana, tentar criar automaticamente
        if (!data.history || data.history.length === 0) {
          console.log(`Nenhum histórico encontrado para semana ${currentWeekStart.toISOString().split('T')[0]}, tentando criar automaticamente...`);
          
          try {
            const createResponse = await fetch('/api/weekly-hours-history', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                action: 'create_week_history',
                weekStart: currentWeekStart.toISOString()
              }),
            });
            
            if (createResponse.ok) {
              const createData = await createResponse.json();
              console.log(`Histórico criado automaticamente:`, createData);
              
              // Buscar novamente após criar
              const retryResponse = await fetch(`/api/weekly-hours-history?weekStart=${currentWeekStart.toISOString()}`);
              const retryData = await retryResponse.json();
              setWeeklyHistory(retryData.history || []);
            } else {
              console.log(`Não foi possível criar histórico automaticamente`);
              setWeeklyHistory([]);
            }
          } catch (createError) {
            console.error("Erro ao criar histórico automaticamente:", createError);
            setWeeklyHistory([]);
          }
        } else {
          setWeeklyHistory(data.history || []);
        }
      } catch (error) {
        console.error("Erro ao buscar histórico semanal:", error);
        setWeeklyHistory([]);
      } finally {
        setLoading(false);
      }
    };

    fetchWeeklyHistory();
  }, [currentWeekStart, isCurrentWeek]);

  const getWeekTitle = () => {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(currentWeekStart.getDate() + 6);
    
    if (isCurrentWeek) {
      return "Horas Trabalhadas por Usuário (Semana Atual)";
    }
    
    return `Horas Trabalhadas por Usuário (${currentWeekStart.toLocaleDateString('pt-BR')} - ${weekEnd.toLocaleDateString('pt-BR')})`;
  };

  const getUserHours = (userId: number) => {
    if (isCurrentWeek) {
      // Calcular horas dinamicamente a partir das work sessions
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(currentWeekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      const completedSessions = sessions.filter(session => 
        session &&
        session.userId === userId &&
        session.status === 'completed' &&
        session.startTime &&
        session.duration &&
        new Date(session.startTime) >= currentWeekStart &&
        new Date(session.startTime) <= weekEnd
      );
      
      const totalHours = completedSessions.reduce((sum, session) => {
        return sum + ((session.duration || 0) / 3600); // Converter segundos para horas
      }, 0);
      
      return totalHours;
    }
    
    const historyEntry = weeklyHistory.find(h => h.userId === userId);
    return historyEntry?.totalHours ?? 0;
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeekStart = new Date(currentWeekStart);
    if (direction === 'prev') {
      newWeekStart.setDate(currentWeekStart.getDate() - 7);
    } else {
      newWeekStart.setDate(currentWeekStart.getDate() + 7);
    }
    setCurrentWeekStart(newWeekStart);
  };

  const goToCurrentWeek = () => {
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    setCurrentWeekStart(monday);
  };


  const handleResetWeeklyHours = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/weekly-hours-history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reset' }),
      });

      if (response.ok) {
        const data = await response.json();
        alert(`Horas semanais resetadas com sucesso! ${data.results.length} usuários processados.`);
        // Refresh the page to update current week hours
        window.location.reload();
      } else {
        const error = await response.json();
        alert(`Erro ao resetar horas: ${error.error}`);
      }
    } catch (error) {
      console.error("Erro ao resetar horas semanais:", error);
      alert("Erro ao resetar horas semanais");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-blue-50 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {getWeekTitle()}
        </h2>
        <div className="flex gap-2 items-center">
          {/* Navegação por semanas */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateWeek('prev')}
              disabled={loading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={goToCurrentWeek}
              disabled={loading || isCurrentWeek}
              className={isCurrentWeek ? "bg-blue-100" : ""}
            >
              Hoje
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateWeek('next')}
              disabled={loading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Botão de reset apenas para semana atual */}
          {isCurrentWeek && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleResetWeeklyHours}
              disabled={loading}
            >
              {loading ? "Processando..." : "Resetar Semana"}
            </Button>
          )}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Horas Trabalhadas</TableHead>
            <TableHead className="text-right">Horas Esperadas</TableHead>
            <TableHead className="text-right">Diferença</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8">
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                  Carregando dados da semana...
                </div>
              </TableCell>
            </TableRow>
          ) : (
            users.map((u) => {
              const horasTrabalhadas = getUserHours(u.id);
              const expected = u.weekHours || 0;
              const diff = expected - horasTrabalhadas;
              let diffColor = "text-gray-700";
              let diffText = '';
              
              if (expected === 0) {
                diffText = "Sem meta definida";
                diffColor = "text-gray-500";
              } else if (diff > 0) {
                diffColor = "text-red-600 font-bold";
                diffText = `${diff.toFixed(1)}h restantes`;
              } else if (diff < 0) {
                diffColor = "text-green-600 font-bold";
                diffText = `+${Math.abs(diff).toFixed(1)}h extra`;
              } else {
                diffColor = "text-blue-700 font-bold";
                diffText = `Meta atingida!`;
              }
              
              return (
                <TableRow key={u.id}>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell className="text-right font-bold text-blue-900">
                    {horasTrabalhadas.toFixed(1)} h
                  </TableCell>
                  <TableCell className="text-right text-blue-700">
                    {expected.toFixed(1)} h
                  </TableCell>
                  <TableCell className={`text-right ${diffColor}`}>{diffText}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
} 
