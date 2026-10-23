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
import {
  DEFAULT_TROPHY_CRITERION_WINDOW,
  TROPHY_CRITERION_FIELDS,
  TROPHY_CRITERION_WINDOWS,
  TROPHY_CRITERION_WINDOW_LABELS,
  TROPHY_CRITERION_LABELS,
  TROPHY_EFFECT_LABELS,
  TROPHY_EFFECT_VERBS,
  TROPHY_TIER_LABELS,
  TROPHY_TIERS,
  trophyCriterionFieldsForWindow,
  type BadgeCriteria,
  type TrophyCriterionWindow,
  type TrophyEffect,
  type TrophyEffectVerb,
  type TrophyTier,
} from "@/backend/domain"

/**
 * plan-v8 V8-6 (DEC-218/219): o formulário passou a falar o vocabulário FECHADO do domínio —
 * `TROPHY_CRITERION_WINDOWS`, `TROPHY_CRITERION_LABELS`, `TROPHY_EFFECT_VERBS`, `TROPHY_TIERS`. A
 * lição medida da DEC-96 é que uma tabela de rótulos local no componente é uma segunda régua, e a
 * primeira deixa de ser lida por ninguém. O painel não pode oferecer um critério que a validação do
 * domínio recusa, nem um efeito com número livre: o número mora no tier.
 *
 * As duas regras de escrita que a onda consertou:
 *   - campo vazio sai do payload (`criteria: null` quando nada foi preenchido). O `parseInt(...) || 0`
 *     antigo escrevia 0 em todo campo não preenchido, e "critério 0" deixou de ser ignorado (DEC-219:
 *     `0` é avaliado) — o formulário antigo criava troféus concedidos a todo mundo.
 *   - `window` declara o que o critério mede, e o formulário só mostra os campos que a janela mede.
 */

interface BadgeData {
  id?: number
  name: string
  description: string
  icon?: string
  color?: string
  category: 'achievement' | 'milestone' | 'special' | 'social'
  criteria?: BadgeCriteria
  effects?: TrophyEffect[]
  isActive: boolean
  createdBy: number
}

/** O payload do critério: só o que foi preenchido, com a janela declarada. Vazio é `null`. */
function criteriaPayload(criteria: BadgeCriteria | undefined): Record<string, unknown> | null {
  if (!criteria) return null
  const filled: Record<string, number | string> = {}
  for (const [key, value] of Object.entries(criteria)) {
    if (key === "window") continue
    if (value === undefined || value === null) continue
    if (typeof value === "string" && !value.trim()) continue
    if (typeof value === "number" && !Number.isFinite(value)) continue
    filled[key] = value
  }
  if (Object.keys(filled).length === 0) return null
  return { window: criteria.window ?? DEFAULT_TROPHY_CRITERION_WINDOW, ...filled }
}

function effectsPayload(effects: TrophyEffect[] | undefined): TrophyEffect[] | null {
  const filled = (effects ?? []).filter((effect) => effect.verb && effect.tier)
  return filled.length === 0 ? null : filled
}

/** O payload do form: `criteria` e `effects` nunca vão como objeto com campos vazios zerados. */
function formPayload(form: BadgeData) {
  const { criteria, effects, ...rest } = form
  return { ...rest, criteria: criteriaPayload(criteria), effects: effectsPayload(effects) }
}

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
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingBadge, setEditingBadge] = useState<BadgeData | null>(null)
  const [formData, setFormData] = useState<BadgeData>({
    name: '',
    description: '',
    icon: '',
    color: '#3B82F6',
    category: 'achievement',
    criteria: { window: DEFAULT_TROPHY_CRITERION_WINDOW },
    effects: [],
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
        await BadgesAPI.update(editingBadge.id!, formPayload(formData))
      } else {
        await BadgesAPI.create(formPayload(formData))
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
      criteria: { window: DEFAULT_TROPHY_CRITERION_WINDOW },
      effects: [],
      isActive: true,
      createdBy: 0
    })
  }

  const setCriterionWindow = (window: TrophyCriterionWindow) => {
    // Trocar a janela descarta os campos que ela não mede: deixar `coins` gravado num critério de
    // `mes` seria o jeito de o payload ir para o 400 do domínio com um campo que a tela ofereceu.
    setFormData(prev => {
      const kept: BadgeCriteria = { window }
      const target = kept as unknown as Record<string, number | string>
      for (const field of trophyCriterionFieldsForWindow(window)) {
        const value = prev.criteria?.[field]
        if (value !== undefined) target[field] = value
      }
      return { ...prev, criteria: kept }
    })
  }

  const updateCriteria = (field: keyof BadgeCriteria, value: string) => {
    // Campo vazio sai do critério (não vira 0). É a diferença entre "não mede isto" e "mede zero",
    // e desde a DEC-219 as duas coisas são decisões diferentes do motor.
    setFormData(prev => {
      const next: BadgeCriteria = { ...prev.criteria, window: prev.criteria?.window ?? DEFAULT_TROPHY_CRITERION_WINDOW }
      if (value === "") {
        delete next[field]
        return { ...prev, criteria: next }
      }
      if (field === "specialCondition") {
        next.specialCondition = value
        return { ...prev, criteria: next }
      }
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) return prev
      // Os campos numéricos do critério são todos `number`, e o campo vem da lista da janela. O
      // cast é sobre a indexação dinâmica (a chave é `keyof BadgeCriteria`), não sobre o valor.
      const numericFields = next as unknown as Record<string, number>
      numericFields[field] = parsed
      return { ...prev, criteria: next }
    })
  }

  const updateEffect = (index: number, patch: Partial<TrophyEffect>) => {
    setFormData(prev => {
      const effects = [...(prev.effects ?? [])]
      effects[index] = { ...effects[index], ...patch }
      return { ...prev, effects }
    })
  }

  const addEffect = () => {
    setFormData(prev => ({
      ...prev,
      effects: [...(prev.effects ?? []), { verb: TROPHY_EFFECT_VERBS[0], tier: TROPHY_TIERS[0] }],
    }))
  }

  const removeEffect = (index: number) => {
    setFormData(prev => ({ ...prev, effects: (prev.effects ?? []).filter((_, i) => i !== index) }))
  }

  const criteriaWindow = formData.criteria?.window ?? DEFAULT_TROPHY_CRITERION_WINDOW
  const windowFields = trophyCriterionFieldsForWindow(criteriaWindow)
  const numericFields = windowFields.filter((field) => field !== "specialCondition") as (keyof typeof TROPHY_CRITERION_LABELS)[]
  const specialConditionField = windowFields.includes("specialCondition")

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

              {/* Criteria — DEC-219: a janela declara o que o critério mede, e o formulário só
                  mostra os campos que a janela mede. */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Critérios para Conquistar</h3>
                <p className="text-sm text-muted-foreground">
                  Escolha a janela que o troféu mede e preencha só o que ele exige. Campo vazio não
                  vale zero: não mede aquilo.
                </p>

                <div>
                  <Label htmlFor="criteria-window">Janela do critério</Label>
                  <Select
                    value={criteriaWindow}
                    onValueChange={(value) => {
                      // O Select do Radix dentro de <form> monta um select nativo oculto, e uma
                      // mudança sem opção registrada chega como "" (medido no V5-6). "" não é
                      // vocabulário: é ignorado.
                      if (value === "") return
                      setCriterionWindow(value as TrophyCriterionWindow)
                    }}
                  >
                    <SelectTrigger id="criteria-window" aria-label="Janela do critério">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TROPHY_CRITERION_WINDOWS.map((window) => (
                        <SelectItem key={window} value={window}>
                          {TROPHY_CRITERION_WINDOW_LABELS[window]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {numericFields.map((field) => (
                    <div key={field}>
                      <Label htmlFor={`criteria-${field}`}>{TROPHY_CRITERION_LABELS[field]}</Label>
                      <Input
                        id={`criteria-${field}`}
                        type="number"
                        step={field === "weeklyHours" ? "0.5" : "1"}
                        min={0}
                        value={formData.criteria?.[field] ?? ""}
                        onChange={(e) => updateCriteria(field, e.target.value)}
                        placeholder="vazio"
                      />
                    </div>
                  ))}
                </div>

                {specialConditionField && (
                  <div>
                    <Label htmlFor="specialCondition">Condição especial</Label>
                    <Textarea
                      id="specialCondition"
                      value={formData.criteria?.specialCondition || ""}
                      onChange={(e) => updateCriteria("specialCondition", e.target.value)}
                      placeholder="Ex: Primeiro usuário a completar 100 tarefas..."
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Condição especial não substitui as métricas: o motor novo não a conhece como
                      métrica, e um troféu concedido por rotina (o CAMPEÃO da temporada) não tem
                      critério nenhum.
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Efeitos — DEC-218: verbo e tier do menu fechado. Nenhum número livre. */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-medium">Efeitos equipáveis</h3>
                    <p className="text-sm text-muted-foreground">
                      O que este troféu faz quando a pessoa o equipar. O valor vem do tier, e o tier é
                      uma lista fechada — não há número a preencher.
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addEffect}>
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar efeito
                  </Button>
                </div>

                {(formData.effects ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sem efeito: o troféu é só conquistável, não muda nenhum credit.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(formData.effects ?? []).map((effect, index) => (
                      <div key={`${effect.verb}-${effect.tier}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
                        <div>
                          <Label htmlFor={`effect-verb-${index}`}>Verbo</Label>
                          <Select
                            value={effect.verb}
                            onValueChange={(value) => {
                              if (value === "") return
                              updateEffect(index, { verb: value as TrophyEffectVerb })
                            }}
                          >
                            <SelectTrigger id={`effect-verb-${index}`} aria-label={`Verbo do efeito ${index + 1}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TROPHY_EFFECT_VERBS.map((verb) => (
                                <SelectItem key={verb} value={verb}>
                                  {TROPHY_EFFECT_LABELS[verb]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor={`effect-tier-${index}`}>Tier</Label>
                          <Select
                            value={effect.tier}
                            onValueChange={(value) => {
                              if (value === "") return
                              updateEffect(index, { tier: value as TrophyTier })
                            }}
                          >
                            <SelectTrigger id={`effect-tier-${index}`} aria-label={`Tier do efeito ${index + 1}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TROPHY_TIERS.map((tier) => (
                                <SelectItem key={tier} value={tier}>
                                  {TROPHY_TIER_LABELS[tier]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Remover efeito ${index + 1}`}
                          onClick={() => removeEffect(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
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
              <p className="text-sm text-muted-foreground mb-4">{badge.description}</p>
              
              {badge.criteria && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">Critérios</h4>
                  <p className="text-xs text-muted-foreground">
                    Janela:{" "}
                    {TROPHY_CRITERION_WINDOW_LABELS[(badge.criteria.window ?? DEFAULT_TROPHY_CRITERION_WINDOW) as TrophyCriterionWindow]}
                  </p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {TROPHY_CRITERION_FIELDS.map((field) => {
                      const value = field === "specialCondition"
                        ? badge.criteria?.specialCondition
                        : badge.criteria?.[field]
                      if (value === undefined || value === null || value === "") return null
                      return (
                        <div key={field} className="flex items-center space-x-2">
                          {field === "specialCondition" ? (
                            <Star className="h-3 w-3" />
                          ) : (
                            <Target className="h-3 w-3" />
                          )}
                          <span className="truncate">
                            {field === "specialCondition"
                              ? String(value)
                              : `${TROPHY_CRITERION_LABELS[field as keyof typeof TROPHY_CRITERION_LABELS]}: ${value}`}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {(badge.effects ?? []).length > 0 && (
                <div className="space-y-2 mt-3">
                  <h4 className="text-sm font-medium text-foreground">Efeitos equipáveis</h4>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {(badge.effects ?? []).map((effect) => (
                      <div key={`${effect.verb}-${effect.tier}`} className="flex items-center space-x-2">
                        <Trophy className="h-3 w-3" />
                        <span>
                          {TROPHY_EFFECT_LABELS[effect.verb as keyof typeof TROPHY_EFFECT_LABELS]} ·{" "}
                          {TROPHY_TIER_LABELS[effect.tier as keyof typeof TROPHY_TIER_LABELS]}
                        </span>
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
