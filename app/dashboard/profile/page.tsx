"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useDailyLogs } from "@/hooks/use-daily-logs"
import { useAuth } from "@/contexts/auth-context"
import { DailyLogList } from "@/components/ui/daily-log-list"
import { UserApproval } from "@/components/features/user-approval"
import { UserSearch } from "@/components/ui/user-search"
import { UserProfileView } from "@/components/ui/user-profile-view"
import { ProfilePictureUpload } from "@/components/forms/profile-picture-upload"
import { UserProfileForm } from "@/components/forms/user-profile-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { Calendar, CalendarDays, User as UserIcon, Settings, Trophy, Target, Coins, Sparkles, Shield, Medal, Flame } from "lucide-react"
import type { User } from "@/contexts/types"
import { TimerCard } from "@/components/ui/timer-card"
import { useWorkSessions } from "@/hooks/use-work-sessions"
import { UserBadges } from "@/components/ui/user-badges"
import { fetchAPI } from "@/contexts/api-client"

type GamificationProgression = {
  userId: number
  xp: number
  level: number
  elo: string
  coins: number
  trophies: number
  nextLevelXp: number
  progressToNextLevel: number
}

type GamificationWallet = {
  userId: number
  coins: number
}

type GamificationProfile = {
  userId: number
  displayName?: string | null
  archetype?: string | null
  title?: string | null
  bioRpg?: string | null
  lore?: string | null
  elo: string
}

type GamificationProfileForm = {
  displayName: string
  archetype: string
  title: string
  bioRpg: string
  lore: string
}

type GamificationQuest = {
  questId: number
  code: string
  title: string
  description?: string | null
  questType: string
  scope: string
  status: string
  progressValue: number
  targetValue: number
  progressPercent: number
  rewards: {
    xp: number
    coins: number
    trophies: number
  }
}

type GamificationInventoryItem = {
  id: number
  itemKey: string
  itemName: string
  rarity: string
  quantity: number
  acquiredAt: string
}

type GamificationStoryArc = {
  storyArcId: number
  code: string
  title: string
  description?: string | null
  chapter: number
  status: string
  currentStep: number
  completedSteps: number
  totalSteps: number
  progressPercent: number
  nextObjective?: string | null
  unlockRequirement?: string | null
}

export default function ProfilePage() {
  const { user: authUser } = useAuth()
  const { logs } = useDailyLogs()
  const { sessions, getWeeklyHours, fetchSessions } = useWorkSessions()
  const [user, setUser] = useState<User | null>(authUser)
  const [weeklyHours, setWeeklyHours] = useState<number>(0)
  const [viewingUser, setViewingUser] = useState<User | null>(null)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [progression, setProgression] = useState<GamificationProgression | null>(null)
  const [wallet, setWallet] = useState<GamificationWallet | null>(null)
  const [gamificationProfile, setGamificationProfile] = useState<GamificationProfile | null>(null)
  const [gamificationLoading, setGamificationLoading] = useState(false)
  const [gamificationError, setGamificationError] = useState<string | null>(null)
  const [quests, setQuests] = useState<GamificationQuest[]>([])
  const [inventory, setInventory] = useState<GamificationInventoryItem[]>([])
  const [storyArcs, setStoryArcs] = useState<GamificationStoryArc[]>([])
  const [claimingQuestId, setClaimingQuestId] = useState<number | null>(null)
  const [editingGamification, setEditingGamification] = useState(false)
  const [savingGamification, setSavingGamification] = useState(false)
  const [gamificationSaveMessage, setGamificationSaveMessage] = useState<string | null>(null)
  const [gamificationForm, setGamificationForm] = useState<GamificationProfileForm>({
    displayName: "",
    archetype: "",
    title: "",
    bioRpg: "",
    lore: "",
  })
  const dayOfWeek = new Date().getDay()

  const monday = useMemo(() => {
    const today = new Date()
    const mondayDate = new Date(today)
    mondayDate.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
    mondayDate.setHours(0, 0, 0, 0)
    return mondayDate
  }, [dayOfWeek])
  const sunday = useMemo(() => {
    const sundayDate = new Date(monday)
    sundayDate.setDate(monday.getDate() + 6)
    sundayDate.setHours(23, 59, 59, 999)
    return sundayDate
  }, [monday])

  useEffect(() => {
    if (authUser) {
      setUser(authUser)
    }
  }, [authUser])

  useEffect(() => {
    if (user) {
      getWeeklyHours(user.id, monday.toISOString(), sunday.toISOString()).then(setWeeklyHours)
    }
  }, [user, sessions, getWeeklyHours, monday, sunday])

  const loadGamification = useCallback(async () => {
    if (!user?.id) return

    try {
      setGamificationLoading(true)
      setGamificationError(null)

      const [progressionRes, walletRes, profileRes, questsRes, inventoryRes, storyRes] = await Promise.all([
        fetchAPI<{ progression: GamificationProgression }>("/api/gamification/me/progression"),
        fetchAPI<{ wallet: GamificationWallet }>("/api/gamification/me/wallet"),
        fetchAPI<{ profile: GamificationProfile }>("/api/gamification/me/profile"),
        fetchAPI<{ quests: GamificationQuest[] }>("/api/gamification/me/quests"),
        fetchAPI<{ inventory: GamificationInventoryItem[] }>("/api/gamification/me/inventory"),
        fetchAPI<{ storyArcs: GamificationStoryArc[] }>("/api/gamification/me/story-arcs"),
      ])

      setProgression(progressionRes?.progression ?? null)
      setWallet(walletRes?.wallet ?? null)
      setGamificationProfile(profileRes?.profile ?? null)
      setQuests(Array.isArray(questsRes?.quests) ? questsRes.quests : [])
      setInventory(Array.isArray(inventoryRes?.inventory) ? inventoryRes.inventory : [])
      setStoryArcs(Array.isArray(storyRes?.storyArcs) ? storyRes.storyArcs : [])
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao carregar gamificação"
      setGamificationError(message)
    } finally {
      setGamificationLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void loadGamification()
  }, [loadGamification])

  useEffect(() => {
    setGamificationForm({
      displayName: gamificationProfile?.displayName ?? "",
      archetype: gamificationProfile?.archetype ?? "",
      title: gamificationProfile?.title ?? "",
      bioRpg: gamificationProfile?.bioRpg ?? "",
      lore: gamificationProfile?.lore ?? "",
    })
  }, [gamificationProfile])

  const handleGamificationFieldChange = (field: keyof GamificationProfileForm, value: string) => {
    setGamificationForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleClaimQuest = async (questId: number) => {
    try {
      setClaimingQuestId(questId)
      setGamificationSaveMessage(null)
      await fetchAPI<{ result: unknown }>(`/api/gamification/me/quests/${questId}/claim`, {
        method: "POST",
      })
      await loadGamification()
      setGamificationSaveMessage("Recompensa da quest resgatada com sucesso.")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao resgatar quest"
      setGamificationSaveMessage(message)
    } finally {
      setClaimingQuestId(null)
    }
  }

  const rarityClass = (rarity: string) => {
    const normalized = rarity.toLowerCase()
    if (normalized.includes("legend")) return "border-amber-300/45 bg-amber-500/12 text-amber-100"
    if (normalized.includes("epic")) return "border-fuchsia-300/45 bg-fuchsia-500/12 text-fuchsia-100"
    if (normalized.includes("rare")) return "border-sky-300/45 bg-sky-500/12 text-sky-100"
    if (normalized.includes("uncommon")) return "border-emerald-300/45 bg-emerald-500/12 text-emerald-100"
    return "border-slate-400/45 bg-slate-500/12 text-slate-100"
  }

  const handleSaveGamification = async () => {
    try {
      setSavingGamification(true)
      setGamificationSaveMessage(null)

      const result = await fetchAPI<{ profile: GamificationProfile }>("/api/gamification/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: gamificationForm.displayName || null,
          archetype: gamificationForm.archetype || null,
          title: gamificationForm.title || null,
          bioRpg: gamificationForm.bioRpg || null,
          lore: gamificationForm.lore || null,
        }),
      })

      setGamificationProfile(result.profile)
      setEditingGamification(false)
      setGamificationSaveMessage("Perfil gamificado atualizado com sucesso.")
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao salvar perfil gamificado"
      setGamificationSaveMessage(message)
    } finally {
      setSavingGamification(false)
    }
  }

  const handleUserSelect = (selectedUser: User) => {
    setViewingUser(selectedUser)
  }

  const handleBackToProfile = () => {
    setViewingUser(null)
  }

  const progressoSemanal = weeklyHours
  const metaSemanal = user?.weekHours ?? 0
  const effectiveElo = progression?.elo ?? gamificationProfile?.elo ?? "Unranked"
  const heroAttributes = useMemo(() => {
    const points = Math.max(0, user?.points ?? 0)
    const xp = Math.max(0, progression?.xp ?? 0)
    const trophies = Math.max(0, progression?.trophies ?? 0)
    const coins = Math.max(0, wallet?.coins ?? progression?.coins ?? 0)
    const level = Math.max(1, progression?.level ?? 1)
    const archetype = (gamificationProfile?.archetype || "Aventureiro").toUpperCase()

    const discipline = Math.floor(points / 20)
    const mastery = Math.floor(xp / 150)
    const prestige = Math.floor(trophies * 2)
    const prosperity = Math.floor(coins / 120)

    if (archetype.includes("ARQUEIRO")) {
      return {
        className: "Arqueiro",
        mainAttribute: `Precisão +${discipline * 2 + mastery}`,
        passive: `Crítico de task +${Math.min(35, 5 + Math.floor(points / 120))}%`,
        synergy: `Bônus de execução rápida: +${Math.min(25, Math.floor(xp / 500))}% XP`,
      }
    }
    if (archetype.includes("PALADINO")) {
      return {
        className: "Paladino",
        mainAttribute: `Resiliência +${prestige + discipline}`,
        passive: `Escudo de squad: +${Math.min(30, 8 + trophies)}%`,
        synergy: `Defesa por elo: +${Math.min(20, Math.floor(level / 3))}%`,
      }
    }
    if (archetype.includes("MAGO")) {
      return {
        className: "Mago",
        mainAttribute: `Poder Arcano +${mastery * 2 + Math.floor(level / 2)}`,
        passive: `Amplificação de XP: +${Math.min(28, 6 + Math.floor(xp / 700))}%`,
        synergy: `Conjuração de quests: +${Math.min(20, Math.floor(points / 180))}%`,
      }
    }
    if (archetype.includes("ALQUIMISTA")) {
      return {
        className: "Alquimista",
        mainAttribute: `Eficiência +${prosperity + discipline}`,
        passive: `Economia na loja: -${Math.min(22, 4 + Math.floor(coins / 800))}%`,
        synergy: `Drop raro adicional: +${Math.min(18, Math.floor(points / 220))}%`,
      }
    }
    if (archetype.includes("BARDO")) {
      return {
        className: "Bardo",
        mainAttribute: `Inspiração +${prestige + Math.floor(level / 2)}`,
        passive: `Bônus em quests cooperativas: +${Math.min(25, 5 + Math.floor(trophies / 2))}%`,
        synergy: `Ganho social de moedas: +${Math.min(20, Math.floor(coins / 1000))}%`,
      }
    }

    return {
      className: "Aventureiro",
      mainAttribute: `Versatilidade +${discipline + mastery + Math.floor(level / 3)}`,
      passive: `Ganho geral de progressão: +${Math.min(16, 4 + Math.floor(points / 260))}%`,
      synergy: `Bônus adaptativo por elo: +${Math.min(14, Math.floor(level / 4))}%`,
    }
  }, [user?.points, progression?.xp, progression?.trophies, progression?.coins, progression?.level, wallet?.coins, gamificationProfile?.archetype])

  const eloTheme = useMemo(() => {
    const elo = effectiveElo.toUpperCase()
    if (elo.includes("CHALLENGER")) {
      return { border: "border-cyan-300", glow: "from-cyan-200/30 via-blue-200/20 to-sky-200/20", text: "text-cyan-900" }
    }
    if (elo.includes("MASTER") || elo.includes("GRANDMASTER")) {
      return { border: "border-violet-300", glow: "from-violet-200/30 via-fuchsia-200/20 to-indigo-200/20", text: "text-violet-900" }
    }
    if (elo.includes("DIAMOND") || elo.includes("PLATINUM")) {
      return { border: "border-sky-300", glow: "from-sky-200/30 via-cyan-200/20 to-blue-200/20", text: "text-sky-900" }
    }
    if (elo.includes("GOLD")) {
      return { border: "border-amber-300", glow: "from-amber-200/40 via-yellow-200/20 to-orange-200/20", text: "text-amber-900" }
    }
    if (elo.includes("SILVER")) {
      return { border: "border-slate-300", glow: "from-slate-200/40 via-zinc-200/20 to-gray-200/20", text: "text-slate-900" }
    }
    if (elo.includes("BRONZE") || elo.includes("FERRO") || elo.includes("IRON")) {
      return { border: "border-orange-300", glow: "from-orange-200/30 via-amber-200/20 to-stone-200/20", text: "text-orange-900" }
    }
    return { border: "border-emerald-300", glow: "from-emerald-200/30 via-teal-200/20 to-lime-200/20", text: "text-emerald-900" }
  }, [effectiveElo])

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando perfil...</p>
        </div>
      </div>
    )
  }

  if (viewingUser) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8">
          <UserProfileView
            user={viewingUser}
            onBack={handleBackToProfile}
            canEdit={false}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">

          <div className="mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <UserIcon className="h-5 w-5" />
                  <span>Buscar Usuários</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <UserSearch
                  onUserSelect={handleUserSelect}
                  placeholder="Digite o nome ou email do usuário..."
                />
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="academic" className="space-y-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="academic">Perfil Acadêmico</TabsTrigger>
              <TabsTrigger value="gamified">Perfil Gamificado</TabsTrigger>
            </TabsList>

            <TabsContent value="academic" className="space-y-6">
              <div className="mb-8">
                <Card className={showProfileForm ? "border-blue-200 bg-blue-50/50" : ""}>
                  <CardHeader className={showProfileForm ? "bg-blue-50/30" : ""}>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center space-x-2">
                        <UserIcon className="h-5 w-5" />
                        <span>Meu Perfil</span>
                        {showProfileForm && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Editando</span>}
                      </CardTitle>
                      <Button
                        variant={showProfileForm ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowProfileForm(!showProfileForm)}
                        className={showProfileForm ? "bg-blue-600 hover:bg-blue-700" : ""}
                      >
                        {showProfileForm ? "Cancelar Edição" : "Editar Perfil"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-4">
                      <Avatar className="h-16 w-16">
                        <AvatarImage
                          src={user?.avatar || undefined}
                          alt={user?.name || ""}
                        />
                        <AvatarFallback className="text-lg font-semibold">
                          {user?.name ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h2 className="text-xl font-bold text-foreground">{user?.name}</h2>
                        <p className="text-muted-foreground">{user?.email}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1">
                            <Trophy className="h-4 w-4 text-yellow-600" />
                            <span className="text-sm font-medium">{user?.points} pontos</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Target className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium">{user?.completedTasks} tarefas concluídas</span>
                          </div>
                        </div>
                      </div>

                      {user && (
                        <div className="mt-4">
                          <UserBadges userId={user.id} limit={4} />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Tabs defaultValue="activity" className="space-y-6">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
                  <TabsTrigger value="activity" className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4" />
                    <span>Atividade</span>
                  </TabsTrigger>
                  <TabsTrigger value="logs" className="flex items-center space-x-2">
                    <CalendarDays className="h-4 w-4" />
                    <span>Logs Diários</span>
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="flex items-center space-x-2">
                    <Settings className="h-4 w-4" />
                    <span>Configurações</span>
                  </TabsTrigger>
                  <TabsTrigger value="admin" className="flex items-center space-x-2">
                    <Settings className="h-4 w-4" />
                    <span>Administração</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="space-y-6">
                  <Card className="border-primary/20 bg-primary/5">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <CalendarDays className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="text-lg font-bold text-foreground">{progressoSemanal.toFixed(1)} h</div>
                        <div className="text-sm text-muted-foreground">Horas trabalhadas nesta semana</div>
                        <div className="text-sm mt-1">
                          {metaSemanal !== undefined && (() => {
                            const remaining = metaSemanal - progressoSemanal
                            if (remaining > 0) return `${remaining.toFixed(1)}h restantes`
                            if (remaining < 0) return `+${Math.abs(remaining).toFixed(1)}h extra`
                            return "Meta semanal atingida!"
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <TimerCard onSessionEnd={() => {
                    if (user?.id) fetchSessions(user.id)
                  }} />
                </TabsContent>

                <TabsContent value="logs" className="space-y-6">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="h-5 w-5" />
                          <span>Registros Diários</span>
                        </CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                        Registros diários agora são gerados no encerramento da Work Session.
                      </div>
                      <DailyLogList
                        logs={logs}
                        currentUser={user}
                        isSubmitting={false}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="settings" className="space-y-6">
                  {showProfileForm && user ? (
                    <div className="space-y-6">
                      <ProfilePictureUpload
                        user={user}
                        onUpdate={(updatedUser) => setUser(updatedUser)}
                      />
                      <UserProfileForm
                        user={user}
                        onUpdate={(updatedUser) => {
                          setUser(updatedUser)
                          setShowProfileForm(false)
                        }}
                        onCancel={() => setShowProfileForm(false)}
                      />
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {user && (
                        <Card>
                          <CardHeader>
                            <CardTitle>Informações do Perfil</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div>
                              <Label className="text-sm font-medium">Nome</Label>
                              <p className="text-sm text-gray-600">{user.name}</p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium">Email</Label>
                              <p className="text-sm text-gray-600">{user.email}</p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium">Biografia</Label>
                              <p className="text-sm text-gray-600">{user.bio || "Nenhuma biografia definida"}</p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium">Visibilidade do Perfil</Label>
                              <p className="text-sm text-gray-600">
                                {user.profileVisibility === "public" && "Público"}
                                {user.profileVisibility === "members_only" && "Apenas Membros"}
                                {user.profileVisibility === "private" && "Privado"}
                              </p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium">Horas Semanais</Label>
                              <p className="text-sm text-gray-600">{user.weekHours} horas</p>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="admin" className="space-y-6">
                  {(user.roles?.includes("COORDENADOR") || user.roles?.includes("LABORATORISTA")) && (
                    <UserApproval />
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="gamified" className="space-y-6">
              <div className="relative overflow-hidden rounded-[30px] border border-slate-700 bg-[#0b1020] text-slate-100 shadow-[0_30px_90px_-35px_rgba(2,6,23,0.95)]">
                <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:radial-gradient(circle_at_18%_20%,rgba(251,191,36,0.22),transparent_35%),radial-gradient(circle_at_82%_12%,rgba(56,189,248,0.2),transparent_36%),linear-gradient(140deg,#0b1020_0%,#10172a_45%,#0f172a_100%)]" />
                <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:repeating-linear-gradient(45deg,transparent_0,transparent_10px,rgba(148,163,184,0.25)_10px,rgba(148,163,184,0.25)_11px)]" />
                <div className="relative z-10 space-y-6 p-4 md:p-7">
                  <section className="rounded-2xl border border-amber-100/20 bg-black/25 p-4 backdrop-blur-sm md:p-6">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-4 md:gap-5">
                        <div className="relative">
                          <div className="absolute -inset-2 rounded-full border border-amber-300/40" />
                          <div className="absolute -inset-4 rounded-full border border-cyan-200/20" />
                          <Avatar className="relative h-24 w-24 border-2 border-amber-200/70 shadow-[0_0_35px_rgba(251,191,36,0.35)]">
                            <AvatarImage src={user?.avatar || undefined} alt={user?.name || ""} />
                            <AvatarFallback className="bg-slate-900 text-xl font-bold text-amber-100">
                              {user?.name ? user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
                            </AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs uppercase tracking-[0.25em] text-amber-200/90">Perfil do Aventureiro</p>
                          <h2 className="text-3xl font-black leading-tight text-white">
                            {gamificationProfile?.displayName || user.name}
                          </h2>
                          <p className="text-sm text-slate-200">
                            {gamificationProfile?.title || "Sem título"} • {gamificationProfile?.archetype || "Classe não definida"}
                          </p>
                        </div>
                      </div>

                      <div className={`rounded-2xl border ${eloTheme.border} bg-gradient-to-br from-white/10 to-white/5 p-4 text-center min-w-56`}>
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl border border-white/30 bg-black/20">
                          <Shield className={`h-6 w-6 ${eloTheme.text}`} />
                        </div>
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-300">Elo Atual</p>
                        <p className={`mt-1 text-xl font-extrabold ${eloTheme.text}`}>{effectiveElo}</p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-slate-500/40 bg-slate-900/35 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-300">Nível</p>
                        <p className="mt-1 text-2xl font-black text-white">{progression?.level ?? 1}</p>
                      </div>
                      <div className="rounded-xl border border-slate-500/40 bg-slate-900/35 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-300">XP Total</p>
                        <p className="mt-1 text-2xl font-black text-white">{(progression?.xp ?? 0).toLocaleString("pt-BR")}</p>
                      </div>
                      <div className="rounded-xl border border-amber-300/30 bg-amber-500/10 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-amber-100">Moedas</p>
                        <p className="mt-1 text-2xl font-black text-amber-200">{(wallet?.coins ?? progression?.coins ?? 0).toLocaleString("pt-BR")}</p>
                      </div>
                      <div className="rounded-xl border border-sky-300/30 bg-sky-500/10 p-3">
                        <p className="text-xs uppercase tracking-[0.14em] text-sky-100">Troféus</p>
                        <p className="mt-1 text-2xl font-black text-sky-200">{(progression?.trophies ?? 0).toLocaleString("pt-BR")}</p>
                      </div>
                    </div>
                  </section>

                  {gamificationLoading ? (
                    <div className="rounded-2xl border border-slate-600 bg-slate-900/50 p-6 text-sm text-slate-300">
                      Carregando dados gamificados...
                    </div>
                  ) : gamificationError ? (
                    <div className="rounded-2xl border border-red-400/40 bg-red-950/30 p-6 space-y-3">
                      <p className="text-sm text-red-200">{gamificationError}</p>
                      <Button variant="outline" size="sm" onClick={() => void loadGamification()}>
                        Tentar novamente
                      </Button>
                    </div>
                  ) : (
                    <>
                      <section className="rounded-2xl border border-indigo-300/25 bg-indigo-950/20 p-4 md:p-5">
                        <div className="mb-3 flex items-center gap-2 text-indigo-100">
                          <Flame className="h-4 w-4" />
                          <p className="text-sm font-semibold uppercase tracking-[0.12em]">Rota de Evolução</p>
                        </div>
                        <Progress value={progression?.progressToNextLevel ?? 0} className="h-5 bg-slate-800" />
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-200">
                          <span>{(progression?.xp ?? 0).toLocaleString("pt-BR")} XP acumulado</span>
                          <span>{(progression?.nextLevelXp ?? 100).toLocaleString("pt-BR")} XP para o próximo nível</span>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-slate-300">
                          <div className="rounded-lg border border-slate-500/40 bg-slate-900/40 p-2 text-center">Iniciante</div>
                          <div className="rounded-lg border border-slate-500/40 bg-slate-900/40 p-2 text-center">Veterano</div>
                          <div className="rounded-lg border border-slate-500/40 bg-slate-900/40 p-2 text-center">Lenda</div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-fuchsia-300/30 bg-fuchsia-950/20 p-4 md:p-5">
                        <div className="mb-4 flex items-center gap-2 text-fuchsia-100">
                          <Sparkles className="h-4 w-4 text-fuchsia-300" />
                          <p className="text-sm font-semibold uppercase tracking-[0.14em]">Atributos do Herói</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="rounded-xl border border-fuchsia-300/25 bg-slate-900/45 p-3">
                            <p className="text-xs uppercase tracking-[0.12em] text-fuchsia-200">Classe Ativa</p>
                            <p className="mt-2 text-sm font-semibold text-slate-100">{heroAttributes.className}</p>
                          </div>
                          <div className="rounded-xl border border-fuchsia-300/25 bg-slate-900/45 p-3">
                            <p className="text-xs uppercase tracking-[0.12em] text-fuchsia-200">Atributo Principal</p>
                            <p className="mt-2 text-sm font-semibold text-slate-100">{heroAttributes.mainAttribute}</p>
                          </div>
                          <div className="rounded-xl border border-fuchsia-300/25 bg-slate-900/45 p-3">
                            <p className="text-xs uppercase tracking-[0.12em] text-fuchsia-200">Passiva</p>
                            <p className="mt-2 text-sm font-semibold text-slate-100">{heroAttributes.passive}</p>
                          </div>
                        </div>
                        <div className="mt-3 rounded-xl border border-fuchsia-300/25 bg-slate-900/45 p-3">
                          <p className="text-xs uppercase tracking-[0.12em] text-fuchsia-200">Sinergia</p>
                          <p className="mt-2 text-sm font-semibold text-slate-100">{heroAttributes.synergy}</p>
                          <p className="mt-2 text-xs text-slate-300">
                            Pontos, XP, troféus e moedas alimentam atributos diferentes da classe para manter progressão útil em todas as frentes.
                          </p>
                        </div>
                      </section>

                      <section className="grid gap-6 xl:grid-cols-[1.8fr_1fr]">
                        <div className="rounded-2xl border border-amber-300/35 bg-gradient-to-br from-amber-100 via-amber-50 to-orange-100 p-4 text-slate-900 md:p-6">
                          <div className="mb-4 flex items-center justify-between gap-2">
                            <p className="text-sm font-bold uppercase tracking-[0.14em] text-amber-900">Ficha do Personagem</p>
                            {!editingGamification ? (
                              <Button size="sm" variant="outline" onClick={() => setEditingGamification(true)}>
                                Editar
                              </Button>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingGamification(false)
                                    setGamificationForm({
                                      displayName: gamificationProfile?.displayName ?? "",
                                      archetype: gamificationProfile?.archetype ?? "",
                                      title: gamificationProfile?.title ?? "",
                                      bioRpg: gamificationProfile?.bioRpg ?? "",
                                      lore: gamificationProfile?.lore ?? "",
                                    })
                                  }}
                                >
                                  Cancelar
                                </Button>
                                <Button size="sm" onClick={handleSaveGamification} disabled={savingGamification}>
                                  {savingGamification ? "Salvando..." : "Salvar"}
                                </Button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-4 text-sm">
                            {editingGamification ? (
                              <>
                                <div className="grid gap-3 md:grid-cols-3">
                                  <div className="space-y-2">
                                    <Label className="text-amber-900">Nome de exibição</Label>
                                    <Input
                                      value={gamificationForm.displayName}
                                      onChange={(e) => handleGamificationFieldChange("displayName", e.target.value)}
                                      placeholder={user.name}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-amber-900">Classe/Arquétipo</Label>
                                    <Select
                                      value={gamificationForm.archetype || "none"}
                                      onValueChange={(value) =>
                                        handleGamificationFieldChange("archetype", value === "none" ? "" : value)
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Selecione um arquétipo" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">Não definido</SelectItem>
                                        <SelectItem value="Paladino">Paladino</SelectItem>
                                        <SelectItem value="Mago">Mago</SelectItem>
                                        <SelectItem value="Arqueiro">Arqueiro</SelectItem>
                                        <SelectItem value="Alquimista">Alquimista</SelectItem>
                                        <SelectItem value="Bardo">Bardo</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-amber-900">Título</Label>
                                    <Input
                                      value={gamificationForm.title}
                                      onChange={(e) => handleGamificationFieldChange("title", e.target.value)}
                                      placeholder="Ex: Guardião do Laboratório"
                                    />
                                  </div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label className="text-amber-900">Bio RPG</Label>
                                    <Textarea
                                      value={gamificationForm.bioRpg}
                                      onChange={(e) => handleGamificationFieldChange("bioRpg", e.target.value)}
                                      placeholder="Resumo curto do personagem"
                                      rows={5}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-amber-900">Lore</Label>
                                    <Textarea
                                      value={gamificationForm.lore}
                                      onChange={(e) => handleGamificationFieldChange("lore", e.target.value)}
                                      placeholder="História completa do personagem"
                                      rows={5}
                                    />
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="grid gap-3 md:grid-cols-3">
                                  <div className="rounded-lg border border-amber-300/60 bg-white/45 p-3">
                                    <Label className="text-amber-900">Nome de exibição</Label>
                                    <p className="mt-1 font-semibold">{gamificationProfile?.displayName || user.name}</p>
                                  </div>
                                  <div className="rounded-lg border border-amber-300/60 bg-white/45 p-3">
                                    <Label className="text-amber-900">Classe/Arquétipo</Label>
                                    <p className="mt-1 font-semibold">{gamificationProfile?.archetype || "Não definido"}</p>
                                  </div>
                                  <div className="rounded-lg border border-amber-300/60 bg-white/45 p-3">
                                    <Label className="text-amber-900">Título</Label>
                                    <p className="mt-1 font-semibold">{gamificationProfile?.title || "Sem título"}</p>
                                  </div>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="rounded-lg border border-amber-300/60 bg-white/45 p-3">
                                    <Label className="text-amber-900">Bio RPG</Label>
                                    <p className="mt-1 font-medium">{gamificationProfile?.bioRpg || "Sem bio RPG"}</p>
                                  </div>
                                  <div className="rounded-lg border border-amber-300/60 bg-white/45 p-3">
                                    <Label className="text-amber-900">Lore</Label>
                                    <p className="mt-1 font-medium">{gamificationProfile?.lore || "Sem lore"}</p>
                                  </div>
                                </div>
                              </>
                            )}
                            {gamificationSaveMessage && (
                              <p className="text-sm text-slate-700">{gamificationSaveMessage}</p>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="rounded-xl border border-amber-300/35 bg-amber-400/10 p-4">
                            <div className="flex items-center gap-2 text-amber-200">
                              <Coins className="h-4 w-4" />
                              <p className="text-xs uppercase tracking-[0.14em]">Tesouro</p>
                            </div>
                            <p className="mt-2 text-3xl font-black text-amber-100">{(wallet?.coins ?? progression?.coins ?? 0).toLocaleString("pt-BR")}</p>
                          </div>
                          <div className="rounded-xl border border-sky-300/35 bg-sky-500/10 p-4">
                            <div className="flex items-center gap-2 text-sky-200">
                              <Medal className="h-4 w-4" />
                              <p className="text-xs uppercase tracking-[0.14em]">Prestígio</p>
                            </div>
                            <p className="mt-2 text-3xl font-black text-sky-100">{(progression?.trophies ?? 0).toLocaleString("pt-BR")}</p>
                          </div>
                          <div className="rounded-xl border border-violet-300/35 bg-violet-500/10 p-4">
                            <div className="flex items-center gap-2 text-violet-200">
                              <Sparkles className="h-4 w-4" />
                              <p className="text-xs uppercase tracking-[0.14em]">Poder</p>
                            </div>
                            <p className="mt-2 text-3xl font-black text-violet-100">Nível {progression?.level ?? 1}</p>
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-slate-500/40 bg-slate-950/35 p-4 md:p-5">
                        <div className="mb-4 flex items-center gap-2 text-slate-100">
                          <Trophy className="h-4 w-4 text-amber-300" />
                          <p className="text-sm font-semibold uppercase tracking-[0.14em]">Galeria de Conquistas</p>
                        </div>
                        <UserBadges userId={user.id} showAll />
                      </section>

                      <section className="rounded-2xl border border-violet-300/30 bg-violet-950/20 p-4 md:p-5">
                        <div className="mb-4 flex items-center gap-2 text-violet-100">
                          <Flame className="h-4 w-4 text-violet-300" />
                          <p className="text-sm font-semibold uppercase tracking-[0.14em]">Quest Board</p>
                        </div>
                        {quests.length === 0 ? (
                          <p className="text-sm text-slate-300">Nenhuma quest disponível no momento.</p>
                        ) : (
                          <div className="space-y-3">
                            {quests.map((quest) => {
                              const canClaim = quest.status === "COMPLETED" && quest.progressValue >= quest.targetValue
                              const claimed = quest.status === "CLAIMED"
                              return (
                                <div
                                  key={quest.questId}
                                  className="rounded-xl border border-violet-300/30 bg-slate-900/45 p-3"
                                >
                                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div className="space-y-1">
                                      <p className="text-sm font-semibold text-violet-100">{quest.title}</p>
                                      <p className="text-xs text-slate-300">{quest.description || "Sem descrição"}</p>
                                      <p className="text-xs text-violet-200/90">
                                        {quest.questType} • {quest.scope}
                                      </p>
                                    </div>
                                    <div className="text-xs text-right text-slate-300">
                                      <p>XP +{quest.rewards.xp}</p>
                                      <p>Coins +{quest.rewards.coins}</p>
                                      <p>Troféus +{quest.rewards.trophies}</p>
                                    </div>
                                  </div>
                                  <div className="mt-3 space-y-2">
                                    <Progress value={quest.progressPercent} className="h-3 bg-slate-800" />
                                    <div className="flex items-center justify-between">
                                      <p className="text-xs text-slate-300">
                                        {quest.progressValue}/{quest.targetValue}
                                      </p>
                                      {claimed ? (
                                        <span className="text-xs font-semibold text-emerald-300">Resgatada</span>
                                      ) : canClaim ? (
                                        <Button
                                          size="sm"
                                          onClick={() => void handleClaimQuest(quest.questId)}
                                          disabled={claimingQuestId === quest.questId}
                                        >
                                          {claimingQuestId === quest.questId ? "Resgatando..." : "Resgatar"}
                                        </Button>
                                      ) : (
                                        <span className="text-xs font-semibold text-amber-300">Em progresso</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </section>

                      <section className="rounded-2xl border border-cyan-300/30 bg-cyan-950/20 p-4 md:p-5">
                        <div className="mb-4 flex items-center gap-2 text-cyan-100">
                          <Flame className="h-4 w-4 text-cyan-300" />
                          <p className="text-sm font-semibold uppercase tracking-[0.14em]">Arcos Narrativos</p>
                        </div>
                        {storyArcs.length === 0 ? (
                          <p className="text-sm text-slate-300">Nenhum arco narrativo disponível.</p>
                        ) : (
                          <div className="space-y-3">
                            {storyArcs.map((arc) => {
                              const locked = arc.status === "LOCKED"
                              const completed = arc.status === "COMPLETED"
                              return (
                                <div key={arc.storyArcId} className="rounded-xl border border-cyan-300/25 bg-slate-900/45 p-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold text-cyan-100">
                                        Capítulo {arc.chapter}: {arc.title}
                                      </p>
                                      <p className="text-xs text-slate-300">{arc.description || "Sem descrição"}</p>
                                    </div>
                                    <Badge variant="outline" className="border-cyan-300/50 text-cyan-200">
                                      {locked ? "Bloqueado" : completed ? "Concluído" : "Em progresso"}
                                    </Badge>
                                  </div>
                                  <div className="mt-3 space-y-2">
                                    <Progress value={arc.progressPercent} className="h-3 bg-slate-800" />
                                    <p className="text-xs text-slate-300">
                                      {arc.completedSteps}/{arc.totalSteps} passos concluídos
                                    </p>
                                    {!completed && arc.nextObjective ? (
                                      <p className="text-xs text-cyan-200">
                                        Próximo objetivo: {arc.nextObjective}
                                      </p>
                                    ) : null}
                                    {locked && arc.unlockRequirement ? (
                                      <p className="text-xs text-amber-200">
                                        Requisito de desbloqueio: {arc.unlockRequirement}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </section>

                      <section className="rounded-2xl border border-emerald-300/30 bg-emerald-950/20 p-4 md:p-5">
                        <div className="mb-4 flex items-center gap-2 text-emerald-100">
                          <Shield className="h-4 w-4 text-emerald-300" />
                          <p className="text-sm font-semibold uppercase tracking-[0.14em]">Inventário</p>
                        </div>
                        {inventory.length === 0 ? (
                          <p className="text-sm text-slate-300">Mochila vazia por enquanto. Conclua quests e abra baús para obter itens.</p>
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {inventory.map((item) => (
                              <div
                                key={item.id}
                                className={`rounded-lg border p-3 ${rarityClass(item.rarity)}`}
                              >
                                <p className="text-sm font-semibold">{item.itemName}</p>
                                <p className="text-xs opacity-90">{item.rarity.toUpperCase()}</p>
                                <p className="mt-1 text-xs">Qtd: {item.quantity}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* TODO: Adicionar edição de perfil */}
    </div>

  )
}
