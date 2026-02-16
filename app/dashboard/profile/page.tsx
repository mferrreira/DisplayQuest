"use client"

import { useState, useEffect } from "react"
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
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Calendar, CalendarDays, User as UserIcon, Settings, Trophy, Target } from "lucide-react"
import type { User } from "@/contexts/types"
import { TimerCard } from "@/components/ui/timer-card"
import { useWorkSessions } from "@/hooks/use-work-sessions"
import { UserBadges } from "@/components/ui/user-badges"

export default function ProfilePage() {
  const { user: authUser } = useAuth()
  const { logs } = useDailyLogs()
  const { sessions, getWeeklyHours, fetchSessions } = useWorkSessions()
  const [user, setUser] = useState<User | null>(authUser)
  const [weeklyHours, setWeeklyHours] = useState<number>(0)
  const [viewingUser, setViewingUser] = useState<User | null>(null)
  const [showProfileForm, setShowProfileForm] = useState(false)

  const today = new Date()

  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)

  useEffect(() => {
    if (authUser) {
      setUser(authUser)
    }
    console.log("authUser", authUser)
  }, [authUser])

  useEffect(() => {
    if (user) {
      getWeeklyHours(user.id, monday.toISOString(), sunday.toISOString()).then(setWeeklyHours)
    }
  }, [user, sessions, getWeeklyHours, monday, sunday])

  const handleUserSelect = (selectedUser: User) => {
    setViewingUser(selectedUser)
  }

  const handleBackToProfile = () => {
    setViewingUser(null)
  }

  const progressoSemanal = weeklyHours
  const metaSemanal = user?.weekHours ?? 0

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
                      alt={user?.name || ''}
                    />
                    <AvatarFallback className="text-lg font-semibold">
                      {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
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
                  
                  {/* Badges do usuário */}
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
            <TabsList className="grid w-full grid-cols-4">
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
                        const remaining = metaSemanal - progressoSemanal;
                        if (remaining > 0) return `${remaining.toFixed(1)}h restantes`;
                        if (remaining < 0) return `+${Math.abs(remaining).toFixed(1)}h extra`;
                        return 'Meta semanal atingida!';
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Timer Card */}
              <TimerCard onSessionEnd={() => {
                if (user?.id) fetchSessions(user.id)
              }} />
            </TabsContent>

            <TabsContent value="logs" className="space-y-6">
              {/* Daily Log Section */}
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
              {/* Profile Edit Form */}
              {showProfileForm && user ? (
                <div className="space-y-6">
                  {/* Upload de Avatar - Agora dentro do modo de edição */}
                  <ProfilePictureUpload
                    user={user}
                    onUpdate={(updatedUser) => setUser(updatedUser)}
                  />
                  
                  {/* Formulário de Edição */}
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
                  {/* Informações do Perfil - Modo visualização */}
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
              {/* User Approval Section - Only for admins and laboratorists */}
              {(user.roles?.includes("COORDENADOR") || user.roles?.includes("LABORATORISTA")) && (
                <UserApproval />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* TODO: Adicionar edição de perfil */}
    </div>

  )
}
