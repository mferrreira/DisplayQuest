"use client"

import Link from "next/link"
import { useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Award, Medal, Sparkles, Star, Target, Trophy, Users } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useProject } from "@/contexts/project-context"
import { useUser } from "@/contexts/user-context"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export default function LeaderboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const { users } = useUser()
  const { projects } = useProject()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => (right.points ?? 0) - (left.points ?? 0)),
    [users],
  )

  const currentUserRank = sortedUsers.findIndex((rankedUser) => rankedUser.id === user?.id) + 1

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .substring(0, 2)

  const getRoleLabel = (roles: string[]) =>
    roles
      .map((role) =>
        role === "GERENTE_PROJETO"
          ? "Gerente de Projeto"
          : role === "LABORATORISTA"
            ? "Laboratorista"
            : role === "COORDENADOR"
              ? "Coordenador"
              : role === "GERENTE"
                ? "Gerente"
                : role === "PESQUISADOR"
                  ? "Pesquisador"
                  : role === "COLABORADOR"
                    ? "Colaborador"
                    : role === "VOLUNTARIO"
                      ? "Voluntario"
                      : role,
      )
      .join(", ")

  const getUserProjects = (userId: number) =>
    projects.filter(
      (project) => project.leaderId === userId || project.members?.some((member) => member.userId === userId),
    )

  const podiumUsers = sortedUsers.slice(0, 3)
  const remainingUsers = sortedUsers.slice(3)

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Carregando...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="container mx-auto flex-1 space-y-8 p-4 md:p-6">
        <section className="rounded-[2rem] border bg-[radial-gradient(circle_at_top,#fde68a,transparent_35%),linear-gradient(135deg,#0f172a,#1e293b)] p-6 text-white shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.25em] text-white/80">
                <Sparkles className="h-3.5 w-3.5" />
                Ranking do Laboratorio
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight md:text-4xl">Quadro de Lideranca</h1>
                <p className="max-w-2xl text-sm text-white/70 md:text-base">
                  Veja o podio do laboratorio, acompanhe quem mais pontuou e navegue pelos perfis para entender badges, tarefas concluidas e participacao em projetos.
                </p>
              </div>
            </div>

            <Card className="border-white/15 bg-white/10 text-white shadow-none backdrop-blur">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Sua posicao</CardTitle>
                <CardDescription className="text-white/70">Resumo da sua colocacao atual</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-6">
                <div>
                  <p className="text-3xl font-black">{currentUserRank}º</p>
                  <p className="text-sm text-white/70">{user.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-amber-300">{user.points}</p>
                  <p className="text-sm text-white/70">pontos</p>
                  <p className="text-xs text-white/60">{user.completedTasks} tarefas concluidas</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          {podiumUsers.map((podiumUser, index) => {
            const position = index + 1
            const userProjects = getUserProjects(podiumUser.id)
            const emphasis =
              position === 1
                ? "lg:col-span-1 lg:scale-[1.03] border-yellow-200 bg-gradient-to-b from-yellow-50 to-amber-100 shadow-yellow-200/60"
                : position === 2
                  ? "border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100"
                  : "border-orange-200 bg-gradient-to-b from-orange-50 to-amber-50"
            const icon =
              position === 1 ? <Trophy className="h-5 w-5 text-yellow-500" /> :
              position === 2 ? <Medal className="h-5 w-5 text-slate-400" /> :
              <Award className="h-5 w-5 text-orange-500" />

            return (
              <Link key={podiumUser.id} href={`/dashboard/profile?userId=${podiumUser.id}`} className="block">
                <Card className={`h-full overflow-hidden transition-transform duration-200 hover:-translate-y-1 ${emphasis}`}>
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between">
                      <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs font-semibold">
                        {position}º lugar
                      </Badge>
                      {icon}
                    </div>
                    <div className="flex items-center gap-4 pt-2">
                      <Avatar className={`border-4 ${position === 1 ? "h-24 w-24 border-yellow-300" : "h-20 w-20 border-white"}`}>
                        <AvatarImage src={podiumUser.avatar || undefined} alt={podiumUser.name} />
                        <AvatarFallback className="text-lg font-bold">{getInitials(podiumUser.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-xl">{podiumUser.name}</CardTitle>
                        <CardDescription className="line-clamp-2 text-slate-600">
                          {getRoleLabel(podiumUser.roles || []) || "Membro do laboratorio"}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl bg-white/70 p-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Star className="h-4 w-4 text-amber-500" />
                          <span className="text-xs uppercase tracking-wide">Pontos</span>
                        </div>
                        <p className="mt-2 text-2xl font-black">{podiumUser.points}</p>
                      </div>
                      <div className="rounded-2xl bg-white/70 p-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Target className="h-4 w-4 text-emerald-500" />
                          <span className="text-xs uppercase tracking-wide">Tasks</span>
                        </div>
                        <p className="mt-2 text-2xl font-black">{podiumUser.completedTasks}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        Projetos
                      </div>
                      {userProjects.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {userProjects.slice(0, 3).map((project) => (
                            <Badge key={project.id} variant="outline" className="bg-white/80">
                              {project.name}
                            </Badge>
                          ))}
                          {userProjects.length > 3 ? (
                            <Badge variant="outline" className="bg-white/80">
                              +{userProjects.length - 3}
                            </Badge>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Sem projetos vinculados.</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </section>

        <section className="rounded-2xl border bg-card">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold">Classificacao completa</h2>
            <p className="text-sm text-muted-foreground">Clique em qualquer usuario para abrir seu perfil detalhado.</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Posicao</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Projetos</TableHead>
                <TableHead>Tarefas concluidas</TableHead>
                <TableHead className="text-right">Pontos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {remainingUsers.map((rankedUser, index) => {
                const userProjects = getUserProjects(rankedUser.id)
                return (
                  <TableRow key={rankedUser.id} className={rankedUser.id === user.id ? "bg-primary/5" : ""}>
                    <TableCell className="font-semibold">{index + 4}º</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/profile?userId=${rankedUser.id}`} className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-muted/60">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={rankedUser.avatar || undefined} alt={rankedUser.name} />
                          <AvatarFallback>{getInitials(rankedUser.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{rankedUser.name}</p>
                          <p className="text-xs text-muted-foreground">{getRoleLabel(rankedUser.roles || [])}</p>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {userProjects.slice(0, 2).map((project) => (
                          <Badge key={project.id} variant="secondary">
                            {project.name}
                          </Badge>
                        ))}
                        {userProjects.length === 0 ? <span className="text-sm text-muted-foreground">-</span> : null}
                        {userProjects.length > 2 ? <Badge variant="outline">+{userProjects.length - 2}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>{rankedUser.completedTasks}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Star className="h-4 w-4 text-amber-500" />
                        <span className="font-bold text-amber-600 dark:text-amber-400">{rankedUser.points}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </section>
      </main>
    </div>
  )
}
