"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Trophy, 
  Target, 
  Clock, 
  Mail, 
  Calendar,
  ArrowLeft,
  User as UserIcon
} from "lucide-react"
import { User as UserType } from "@/contexts/types"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { UserBadgesCard } from "@/components/ui/user-badges"

interface UserProfileViewProps {
  user: UserType
  onBack: () => void
  canEdit?: boolean
  onEdit?: () => void
  projectNames?: string[]
}

// Helper function to safely format dates
const safeFormatDistance = (date: string | Date | null | undefined, fallback: string = 'Data não disponível') => {
  if (!date) return fallback
  try {
    const dateObj = new Date(date)
    if (isNaN(dateObj.getTime())) return fallback
    return formatDistanceToNow(dateObj, { addSuffix: true, locale: ptBR })
  } catch {
    return fallback
  }
}

export function UserProfileView({ user, onBack, canEdit = false, onEdit, projectNames = [] }: UserProfileViewProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      'COORDENADOR': 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-500/25',
      'GERENTE': 'bg-blue-100 dark:bg-info/15 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-info/25',
      'LABORATORISTA': 'bg-green-100 dark:bg-success/15 text-green-800 dark:text-green-300 border-green-200 dark:border-success/25',
      'PESQUISADOR': 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300 border-orange-200',
      'GERENTE_PROJETO': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-300 border-indigo-200',
      'COLABORADOR': 'bg-gray-100 dark:bg-muted/40 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-border',
      'VOLUNTARIO': 'bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300 border-pink-200',
    }
    return colors[role] || 'bg-gray-100 dark:bg-muted/40 text-gray-800 dark:text-gray-200 border-gray-200 dark:border-border'
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center space-x-4">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-foreground">Perfil do Usuário</h1>
      </div>

      {/* Main Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user.avatar || undefined} alt={user.name} />
                <AvatarFallback className="text-lg font-semibold">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground">{user.name}</h2>
                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{user.email}</span>
                </div>
                <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  <span>Membro desde {safeFormatDistance(user.createdAt)}</span>
                </div>
              </div>
            </div>
            {canEdit && onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <UserIcon className="h-4 w-4 mr-2" />
                Editar Perfil
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Bio */}
          {user.bio && (
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-foreground mb-2">Sobre</h3>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{user.bio}</p>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-blue-50 dark:bg-info/10 rounded-lg">
              <Trophy className="h-6 w-6 text-blue-600 dark:text-info mx-auto mb-1" />
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-300">{user.points}</div>
              <div className="text-xs text-blue-700 dark:text-blue-300">Pontos</div>
            </div>
            <div className="text-center p-3 bg-green-50 dark:bg-success/10 rounded-lg">
              <Target className="h-6 w-6 text-green-600 dark:text-success mx-auto mb-1" />
              <div className="text-2xl font-bold text-green-900 dark:text-green-300">{user.completedTasks}</div>
              <div className="text-xs text-green-700 dark:text-green-300">Tarefas</div>
            </div>
            <div className="text-center p-3 bg-orange-50 dark:bg-orange-500/10 rounded-lg">
              <Clock className="h-6 w-6 text-orange-600 dark:text-orange-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-orange-900 dark:text-orange-300">{user.weekHours}</div>
              <div className="text-xs text-orange-700 dark:text-orange-300">Horas/Sem</div>
            </div>
            <div className="text-center p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg">
              <UserIcon className="h-6 w-6 text-purple-600 dark:text-purple-400 mx-auto mb-1" />
              <div className="text-2xl font-bold text-purple-900 dark:text-purple-300">{user.roles.length}</div>
              <div className="text-xs text-purple-700 dark:text-purple-300">Funções</div>
            </div>
          </div>

          {/* Roles */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-foreground mb-3">Funções</h3>
            <div className="flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <Badge 
                  key={role} 
                  variant="outline" 
                  className={`${getRoleColor(role)} border`}
                >
                  {role.replace('_', ' ')}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-medium text-gray-900 dark:text-foreground">Projetos</h3>
            {projectNames.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {projectNames.map((projectName) => (
                  <Badge key={projectName} variant="secondary">
                    {projectName}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum projeto vinculado no momento.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <UserBadgesCard userId={user.id} />
    </div>
  )
}
