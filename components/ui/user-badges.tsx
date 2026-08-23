"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BadgesAPI } from "@/contexts/api-client"
import { Trophy, Award, Star, Zap, Users, Calendar, Target, Crown } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface UserBadge {
  id: number
  badgeId: number
  userId: number
  earnedAt: string
  earnedBy?: number | null
  badge?: {
    id: number
    name: string
    description: string
    icon?: string | null
    color?: string | null
    category: 'achievement' | 'milestone' | 'special' | 'social'
    criteria?: any
    isActive: boolean
  }
}

interface UserBadgesProps {
  userId: number
  showAll?: boolean
  limit?: number
  className?: string
}

export function UserBadges({ userId, showAll = false, limit = 6, className = "" }: UserBadgesProps) {
  const [badges, setBadges] = useState<UserBadge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        setLoading(true)
        const response = await BadgesAPI.getUserBadges(userId, showAll ? undefined : limit)
        setBadges(response.badges || [])
        setError(null)
      } catch (err: any) {
        console.error("Erro ao buscar badges:", err)
        setError("Erro ao carregar badges")
        setBadges([])
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchBadges()
    }
  }, [userId, showAll, limit])

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'achievement':
        return <Trophy className="h-4 w-4" />
      case 'milestone':
        return <Target className="h-4 w-4" />
      case 'special':
        return <Crown className="h-4 w-4" />
      case 'social':
        return <Users className="h-4 w-4" />
      default:
        return <Award className="h-4 w-4" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'achievement':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'milestone':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'special':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'social':
        return 'bg-green-100 text-green-800 border-green-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'achievement':
        return 'Conquista'
      case 'milestone':
        return 'Marco'
      case 'special':
        return 'Especial'
      case 'social':
        return 'Social'
      default:
        return 'Badge'
    }
  }

  const formatEarnedDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24))
    
    if (diffInDays === 0) return 'Hoje'
    if (diffInDays === 1) return 'Ontem'
    if (diffInDays < 7) return `${diffInDays} dias atrás`
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} semanas atrás`
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} meses atrás`
    return `${Math.floor(diffInDays / 365)} anos atrás`
  }

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Badges</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-6 w-16 bg-muted animate-pulse rounded-full" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Badges</span>
        </div>
        <p className="text-xs text-muted-foreground">Erro ao carregar badges</p>
      </div>
    )
  }

  const safeBadges = badges.filter((userBadge): userBadge is typeof userBadge & { badge: NonNullable<typeof userBadge.badge> } => Boolean(userBadge.badge))

  if (safeBadges.length === 0) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Badges</span>
        </div>
        <p className="text-xs text-muted-foreground">Nenhum badge conquistado ainda</p>
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">
          Badges ({safeBadges.length})
        </span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        <TooltipProvider>
          {safeBadges.map((userBadge) => (
            <Tooltip key={userBadge.id}>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={`${getCategoryColor(userBadge.badge.category)} cursor-help transition-all hover:scale-105`}
                >
                  <div className="flex items-center gap-1">
                    {getCategoryIcon(userBadge.badge.category)}
                    <span className="text-xs font-medium">
                      {userBadge.badge.name}
                    </span>
                  </div>
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <div className="font-medium">{userBadge.badge.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {userBadge.badge.description}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${getCategoryColor(userBadge.badge.category)}`}>
                      {getCategoryName(userBadge.badge.category)}
                    </span>
                    <span className="text-muted-foreground">
                      {formatEarnedDate(userBadge.earnedAt)}
                    </span>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </div>
  )
}

// Componente para mostrar badges em formato de card (para perfis completos)
export function UserBadgesCard({ userId, className = "" }: { userId: number; className?: string }) {
  const [badges, setBadges] = useState<UserBadge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        setLoading(true)
        const response = await BadgesAPI.getUserBadges(userId)
        setBadges(response.badges || [])
        setError(null)
      } catch (err: any) {
        console.error("Erro ao buscar badges:", err)
        setError("Erro ao carregar badges")
        setBadges([])
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchBadges()
    }
  }, [userId])

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'achievement':
        return <Trophy className="h-5 w-5" />
      case 'milestone':
        return <Target className="h-5 w-5" />
      case 'special':
        return <Crown className="h-5 w-5" />
      case 'social':
        return <Users className="h-5 w-5" />
      default:
        return <Award className="h-5 w-5" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'achievement':
        return 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'
      case 'milestone':
        return 'bg-blue-50 border-blue-200 hover:bg-blue-100'
      case 'special':
        return 'bg-purple-50 border-purple-200 hover:bg-purple-100'
      case 'social':
        return 'bg-green-50 border-green-200 hover:bg-green-100'
      default:
        return 'bg-gray-50 border-gray-200 hover:bg-gray-100'
    }
  }

  const getCategoryName = (category: string) => {
    switch (category) {
      case 'achievement':
        return 'Conquista'
      case 'milestone':
        return 'Marco'
      case 'special':
        return 'Especial'
      case 'social':
        return 'Social'
      default:
        return 'Badge'
    }
  }

  const formatEarnedDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Badges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Badges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Erro ao carregar badges</p>
        </CardContent>
      </Card>
    )
  }

  const safeBadges = badges.filter((userBadge): userBadge is typeof userBadge & { badge: NonNullable<typeof userBadge.badge> } => Boolean(userBadge.badge))

  if (safeBadges.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Badges
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhum badge conquistado ainda
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Continue trabalhando para conquistar seus primeiros badges!
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Badges ({safeBadges.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {safeBadges.map((userBadge) => (
            <div
              key={userBadge.id}
              className={`p-3 rounded-lg border transition-colors ${getCategoryColor(userBadge.badge.category)}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  {getCategoryIcon(userBadge.badge.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">
                    {userBadge.badge.name}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {userBadge.badge.description}
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs font-medium">
                      {getCategoryName(userBadge.badge.category)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatEarnedDate(userBadge.earnedAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
