import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, FolderOpen, CheckCircle, TrendingUp, UserCheck } from "lucide-react";
import React from "react";

interface AdminStatsCardsProps {
  stats: {
    totalUsers: number;
    totalProjects: number;
    totalTasks: number;
    completedTasks: number;
    activeResponsibilities: number;
    totalPoints: number;
    avgCompletionRate: number;
  };
  users: any[];
  projects: any[];
  tasks?: any[];
  sessions?: any[];
}

export const AdminStatsCards: React.FC<AdminStatsCardsProps> = ({ stats, users, projects }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stats.totalUsers}</div>
        <p className="text-xs text-muted-foreground">
          {users.filter(u => u.status === "active").length} ativos
        </p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Projetos</CardTitle>
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stats.totalProjects}</div>
        <p className="text-xs text-muted-foreground">
          {projects.filter(p => p.status === "active").length} ativos
        </p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Tarefas Concluídas</CardTitle>
        <CheckCircle className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stats.completedTasks}</div>
        <p className="text-xs text-muted-foreground">
          {(stats.avgCompletionRate || 0).toFixed(1)}% de conclusão
        </p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Pontos Totais</CardTitle>
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{stats.totalPoints || 0}</div>
        <p className="text-xs text-muted-foreground">
          Média: {stats.totalUsers > 0 ? Math.round((stats.totalPoints || 0) / stats.totalUsers) : 0} por usuário
        </p>
      </CardContent>
    </Card>
  </div>
); 
