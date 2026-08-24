import { Card, CardContent } from "@/components/ui/card";

interface AdminStatsCardProps {
  stats: {
    totalUsers: number;
    totalProjects: number;
    totalTasks: number;
    completedTasks: number;
    activeResponsibilities: number;
    totalPoints: number;
    avgCompletionRate: number;
  };
}

export function AdminStatsCard({ stats }: AdminStatsCardProps) {
  return (
    <Card className="mb-4">
      <CardContent className="flex flex-wrap gap-4 p-4">
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.totalUsers}</span>
          <span className="text-xs text-gray-500 dark:text-muted-foreground">Usuários</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.totalProjects}</span>
          <span className="text-xs text-gray-500 dark:text-muted-foreground">Projetos</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.totalTasks}</span>
          <span className="text-xs text-gray-500 dark:text-muted-foreground">Tarefas</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-green-700 dark:text-green-300">{stats.completedTasks}</span>
          <span className="text-xs text-gray-500 dark:text-muted-foreground">Tarefas Concluídas</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-purple-700 dark:text-purple-300">{stats.activeResponsibilities}</span>
          <span className="text-xs text-gray-500 dark:text-muted-foreground">Responsabilidades Ativas</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{stats.totalPoints}</span>
          <span className="text-xs text-gray-500 dark:text-muted-foreground">Pontos</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">{stats.avgCompletionRate.toFixed(1)}%</span>
          <span className="text-xs text-gray-500 dark:text-muted-foreground">Conclusão Média</span>
        </div>
      </CardContent>
    </Card>
  );
} 