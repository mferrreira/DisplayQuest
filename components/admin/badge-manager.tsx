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
  Users,
  Award,
  Settings
} from "lucide-react"
import { BadgesAPI } from "@/contexts/api-client"
import { METRICS, type BadgeClause, type BadgeCriteriaV2 } from "@/backend/domain"

interface BadgeData {
  id?: number
  name: string
  description: string
  icon?: string
  color?: string
  category: 'achievement' | 'milestone' | 'special' | 'social'
  criteria?: BadgeCriteriaV2 | null
  /** plan-v16 S04 (R6): CHAVE do ícone no bucket; o binário sai pela rota autenticada. */
  iconKey?: string | null
  isActive: boolean
  createdBy: number
}

const metricLabel = (metric: string) => METRICS.find(m => m.id === metric)?.label ?? metric

const categoryIcons = {
  achievement: Trophy,
  milestone: Target,
  special: Star,
  social: Users
}

const categoryColors = {
  achievement: 'bg-warning/15 text-warning border-warning/25',
  milestone: 'bg-info/15 text-info border-info/25',
  special: 'bg-review/15 text-review border-review/25',
  social: 'bg-success/15 text-success border-success/25'
}

export function BadgeManager() {
  const [badges, setBadges] = useState<BadgeData[]>([])
  const [loading, setLoading] = useState(true)
  // plan-v16 S04: a frase recusada pela rota chega na tela (a rota decide a autoridade, R3).
  const [iconAlert, setIconAlert] = useState<string | null>(null)
  // O arquivo escolhido no diálogo de criação/edição; a rota faz a conversão a WebP na escrita.
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingBadge, setEditingBadge] = useState<BadgeData | null>(null)
  const [formData, setFormData] = useState<BadgeData>({
    name: '',
    description: '',
    icon: '',
    color: '#3B82F6',
    category: 'achievement',
    criteria: null,
    isActive: true,
    createdBy: 0 // Will be set by server from authenticated user
  })
  // plan-v15 S02: a lista de cláusulas v2 é o estado do picker; o criteria do payload
  // só existe no submit.
  const [clauses, setClauses] = useState<BadgeClause[]>([])

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
      const criteria: BadgeCriteriaV2 | null = clauses.length > 0 ? { version: 2, clauses } : null
      const payload = { ...formData, criteria }
      let savedId: number
      if (editingBadge) {
        const response = await BadgesAPI.update(editingBadge.id!, payload)
        savedId = response.badge.id
      } else {
        const response = await BadgesAPI.create(payload)
        savedId = response.badge.id
      }
      if (iconFile) {
        try {
          await BadgesAPI.uploadIcon(savedId, iconFile)
          setIconAlert(null)
        } catch (error) {
          const message = typeof (error as Error)?.message === "string" && (error as Error).message
            ? (error as Error).message
            : "Não foi possível enviar o ícone"
          setIconAlert(message)
        }
      }

      setShowCreateDialog(false)
      setEditingBadge(null)
      setIconFile(null)
      resetForm()
      loadBadges()
    } catch (error) {
      console.error('Error saving badge:', error)
    }
  }

  const handleEdit = (badge: BadgeData) => {
    setEditingBadge(badge)
    setFormData(badge)
    setClauses(badge.criteria?.clauses ?? [])
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
      criteria: null,
      isActive: true,
      createdBy: 0
    })
    setClauses([])
  }

  const updateClause = (index: number, patch: Partial<BadgeClause>) => {
    setClauses(prev => prev.map((clause, i) => (i === index ? { ...clause, ...patch } : clause)))
  }

  const getCategoryIcon = (category: string) => {
    const IconComponent = categoryIcons[category as keyof typeof categoryIcons] || Trophy
    return <IconComponent className="h-4 w-4" />
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-info"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Gerenciar Badges</h2>
          <p className="text-muted-foreground">Crie e gerencie badges para motivar os usuários</p>
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
                <p className="text-sm text-muted-foreground">
                  Cada cláusula exige que a métrica do registro atinja o valor mínimo. Sem cláusula,
                  o badge só pode ser concedido manualmente pela gestão.
                </p>

                {clauses.map((clause, index) => (
                  <div key={index} className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label htmlFor={`metric-${index}`}>Métrica do critério</Label>
                      <Select
                        value={clause.metric}
                        onValueChange={(value) => {
                          // Lição V5-6: dentro de form o Radix dispara change vazio; ignorar.
                          if (value === "") return
                          updateClause(index, { metric: value })
                        }}
                      >
                        <SelectTrigger id={`metric-${index}`} aria-label="Métrica do critério">
                          <SelectValue placeholder="Escolher métrica" />
                        </SelectTrigger>
                        <SelectContent>
                          {METRICS.map((metric) => (
                            <SelectItem key={metric.id} value={metric.id}>
                              {metric.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor={`value-${index}`}>Valor do critério</Label>
                      <Input
                        id={`value-${index}`}
                        type="number"
                        min="1"
                        value={Number.isFinite(clause.value) ? clause.value : ''}
                        onChange={(e) => {
                          const parsed = parseFloat(e.target.value)
                          updateClause(index, { value: Number.isFinite(parsed) ? parsed : 0 })
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remover cláusula ${index + 1}`}
                      onClick={() => setClauses(prev => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setClauses(prev => [...prev, { metric: METRICS[0].id, op: '>=', value: 1 }])}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar critério
                </Button>
              </div>

              {/* plan-v16 S04 (R6, pedido do dono 2026-11-05): o envio do ícone mora no diálogo. */}
              <div className="space-y-2">
                <Label>Ícone do badge</Label>
                <div className="flex items-center gap-3">
                  {iconFile && typeof URL.createObjectURL === "function" ? (
                    <img src={URL.createObjectURL(iconFile)} alt="Pré-visualização do ícone" className="h-10 w-10 object-contain" />
                  ) : (
                    editingBadge?.iconKey && (
                      <img
                        src={`/api/badges/${editingBadge.id}/icon/file?v=${encodeURIComponent(editingBadge.iconKey)}`}
                        alt={`Ícone do ${editingBadge.name}`}
                        className="h-10 w-10 object-contain"
                      />
                    )
                  )}
                  <input
                    type="file"
                    accept="image/png,image/webp"
                    aria-label="Arquivo de ícone do badge"
                    onChange={(event) => setIconFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  O arquivo é convertido para WebP na escrita. PNG, JPEG, GIF e WebP passam; PDF não.
                </p>
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

      {iconAlert && (
        <p role="alert" className="text-sm text-destructive">
          {iconAlert}
        </p>
      )}

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
                    aria-label={`Editar ${badge.name}`}
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
              <p className="text-sm text-muted-foreground mb-4">{badge.description}</p>

              {/* plan-v16 S04 (R6): a imagem do arquivo quando há chave; o envio mora no diálogo. */}
              {badge.iconKey && (
                <div className="mb-2">
                  <img
                    src={`/api/badges/${badge.id}/icon/file?v=${encodeURIComponent(badge.iconKey)}`}
                    alt={`Ícone do ${badge.name}`}
                    className="h-10 w-10 object-contain"
                  />
                </div>
              )}
              
              {badge.criteria && Array.isArray(badge.criteria.clauses) && badge.criteria.clauses.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">Critérios:</h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {badge.criteria.clauses.map((clause) => (
                      <div key={clause.metric} className="flex items-center space-x-2">
                        <Target className="h-3 w-3" />
                        <span>{metricLabel(clause.metric)} ≥ {clause.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${badge.isActive ? 'bg-success' : 'bg-muted-foreground'}`} />
                  <span className="text-xs text-muted-foreground">
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
          <Award className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Nenhum badge criado</h3>
          <p className="text-muted-foreground mb-4">Crie seu primeiro badge para começar a motivar os usuários</p>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Criar Primeiro Badge
          </Button>
        </div>
      )}
    </div>
  )
}
