"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { 
  Plus, 
  Edit, 
  Trash2, 
  Star, 
  Trophy, 
  Target, 
  Clock, 
  Users,
  Award,
  Settings
} from "lucide-react"
import { BadgesAPI } from "@/contexts/api-client"

interface BadgeCriteria {
  points?: number
  tasks?: number
  projects?: number
  workSessions?: number
  weeklyHours?: number
  consecutiveDays?: number
  specialCondition?: string
}

interface BadgeData {
  id?: number
  name: string
  description: string
  icon?: string
  color?: string
  category: 'achievement' | 'milestone' | 'special' | 'social'
  criteria?: BadgeCriteria
  isActive: boolean
  createdBy: number
}

const categoryIcons = {
  achievement: Trophy,
  milestone: Target,
  special: Star,
  social: Users
}

const categoryColors = {
  achievement: 'bg-yellow-100 dark:bg-warning/15 text-yellow-800 dark:text-yellow-300 border-yellow-200 dark:border-warning/25',
  milestone: 'bg-blue-100 dark:bg-info/15 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-info/25',
  special: 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-500/25',
  social: 'bg-green-100 dark:bg-success/15 text-green-800 dark:text-green-300 border-green-200 dark:border-success/25'
}

export function BadgeManager() {
  const [badges, setBadges] = useState<BadgeData[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingBadge, setEditingBadge] = useState<BadgeData | null>(null)
  const [formData, setFormData] = useState<BadgeData>({
    name: '',
    description: '',
    icon: '',
    color: '#3B82F6',
    category: 'achievement',
    criteria: {},
    isActive: true,
    createdBy: 0 // Will be set by server from authenticated user
  })

  useEffect(() => {
    loadBadges()
  }, [])

  const loadBadges = async () => {
    try {
      setLoading(true)
      const response = await BadgesAPI.getAll()
      setBadges(response.badges || [])
    } catch (error) {
      console.error('Error loading badges:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingBadge) {
        await BadgesAPI.update(editingBadge.id!, formData)
      } else {
        await BadgesAPI.create(formData)
      }
      
      setShowCreateDialog(false)
      setEditingBadge(null)
      resetForm()
      loadBadges()
    } catch (error) {
      console.error('Error saving badge:', error)
    }
  }

  const handleEdit = (badge: BadgeData) => {
    setEditingBadge(badge)
    setFormData(badge)
    setShowCreateDialog(true)
  }

  const handleDelete = async (badgeId: number) => {
    if (!confirm('Tem certeza que deseja excluir este badge?')) return
    
    try {
      await BadgesAPI.delete(badgeId)
      loadBadges()
    } catch (error) {
      console.error('Error deleting badge:', error)
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      icon: '',
      color: '#3B82F6',
      category: 'achievement',
      criteria: {},
      isActive: true,
      createdBy: 0
    })
  }

  const updateCriteria = (field: keyof BadgeCriteria, value: number | string) => {
    setFormData(prev => ({
      ...prev,
      criteria: {
        ...prev.criteria,
        [field]: value
      }
    }))
  }

  const getCategoryIcon = (category: string) => {
    const IconComponent = categoryIcons[category as keyof typeof categoryIcons] || Trophy
    return <IconComponent className="h-4 w-4" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 dark:border-info"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-foreground">Gerenciar Badges</h2>
          <p className="text-gray-600 dark:text-muted-foreground">Crie e gerencie badges para motivar os usuários</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingBadge(null); resetForm(); }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Badge
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingBadge ? 'Editar Badge' : 'Criar Novo Badge'}
              </DialogTitle>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Informações Básicas</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Nome do Badge</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Primeira Tarefa"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Categoria</Label>
                    <Select 
                      value={formData.category} 
                      onValueChange={(value: any) => setFormData(prev => ({ ...prev, category: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="achievement">Conquista</SelectItem>
                        <SelectItem value="milestone">Marco</SelectItem>
                        <SelectItem value="special">Especial</SelectItem>
                        <SelectItem value="social">Social</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Descreva o que este badge representa..."
                    rows={3}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="icon">Ícone (emoji ou nome)</Label>
                    <Input
                      id="icon"
                      value={formData.icon}
                      onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                      placeholder="🏆 ou trophy"
                    />
                  </div>
                  <div>
                    <Label htmlFor="color">Cor</Label>
                    <Input
                      id="color"
                      type="color"
                      value={formData.color}
                      onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                  />
                  <Label htmlFor="isActive">Badge ativo</Label>
                </div>
              </div>

              <Separator />

              {/* Criteria */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Critérios para Conquistar</h3>
                <p className="text-sm text-gray-600 dark:text-muted-foreground">
                  Defina os critérios que o usuário deve atingir para ganhar este badge
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="points">Pontos mínimos</Label>
                    <Input
                      id="points"
                      type="number"
                      value={formData.criteria?.points || ''}
                      onChange={(e) => updateCriteria('points', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tasks">Tarefas concluídas</Label>
                    <Input
                      id="tasks"
                      type="number"
                      value={formData.criteria?.tasks || ''}
                      onChange={(e) => updateCriteria('tasks', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="projects">Projetos participados</Label>
                    <Input
                      id="projects"
                      type="number"
                      value={formData.criteria?.projects || ''}
                      onChange={(e) => updateCriteria('projects', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="workSessions">Sessões de trabalho</Label>
                    <Input
                      id="workSessions"
                      type="number"
                      value={formData.criteria?.workSessions || ''}
                      onChange={(e) => updateCriteria('workSessions', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="weeklyHours">Horas semanais</Label>
                    <Input
                      id="weeklyHours"
                      type="number"
                      step="0.5"
                      value={formData.criteria?.weeklyHours || ''}
                      onChange={(e) => updateCriteria('weeklyHours', parseFloat(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="consecutiveDays">Dias consecutivos</Label>
                    <Input
                      id="consecutiveDays"
                      type="number"
                      value={formData.criteria?.consecutiveDays || ''}
                      onChange={(e) => updateCriteria('consecutiveDays', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="specialCondition">Condição especial</Label>
                  <Textarea
                    id="specialCondition"
                    value={formData.criteria?.specialCondition || ''}
                    onChange={(e) => updateCriteria('specialCondition', e.target.value)}
                    placeholder="Ex: Primeiro usuário a completar 100 tarefas..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingBadge ? 'Atualizar' : 'Criar'} Badge
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {badges.map((badge) => (
          <Card key={badge.id} className="relative">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div 
                    // dark-mode:ok (branco sobre cor dinâmica do badge)
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg"
                    style={{ backgroundColor: badge.color }}
                  >
                    {badge.icon || getCategoryIcon(badge.category)}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{badge.name}</CardTitle>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${categoryColors[badge.category]}`}
                    >
                      {badge.category}
                    </Badge>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(badge)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(badge.id!)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 dark:text-muted-foreground mb-4">{badge.description}</p>
              
              {badge.criteria && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-foreground">Critérios:</h4>
                  <div className="space-y-1 text-xs text-gray-600 dark:text-muted-foreground">
                    {badge.criteria.points && (
                      <div className="flex items-center space-x-2">
                        <Trophy className="h-3 w-3" />
                        <span>{badge.criteria.points} pontos</span>
                      </div>
                    )}
                    {badge.criteria.tasks && (
                      <div className="flex items-center space-x-2">
                        <Target className="h-3 w-3" />
                        <span>{badge.criteria.tasks} tarefas</span>
                      </div>
                    )}
                    {badge.criteria.projects && (
                      <div className="flex items-center space-x-2">
                        <Users className="h-3 w-3" />
                        <span>{badge.criteria.projects} projetos</span>
                      </div>
                    )}
                    {badge.criteria.weeklyHours && (
                      <div className="flex items-center space-x-2">
                        <Clock className="h-3 w-3" />
                        <span>{badge.criteria.weeklyHours}h/semana</span>
                      </div>
                    )}
                    {badge.criteria.specialCondition && (
                      <div className="flex items-center space-x-2">
                        <Star className="h-3 w-3" />
                        <span className="truncate">{badge.criteria.specialCondition}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${badge.isActive ? 'bg-green-500 dark:bg-success' : 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-600 dark:text-muted-foreground">
                    {badge.isActive ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {badges.length === 0 && (
        <div className="text-center py-12">
          <Award className="h-12 w-12 text-gray-400 dark:text-muted-foreground/70 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-foreground mb-2">Nenhum badge criado</h3>
          <p className="text-gray-600 dark:text-muted-foreground mb-4">Crie seu primeiro badge para começar a motivar os usuários</p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Primeiro Badge
          </Button>
        </div>
      )}
    </div>
  )
}
