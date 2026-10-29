"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import type { Project, Task } from "@/contexts/types"
import { useAuth } from "@/contexts/auth-context"
import { useTask } from "@/contexts/task-context"
import { useUser } from "@/contexts/user-context"
import { projectsApi } from "@/lib/api/endpoints/projects"
import { hasAccess } from "@/lib/utils/access-control"
import { PageHeader } from "@/components/ui/page-header"
import { StatCard } from "@/components/ui/stat-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { ProjectDialog } from "@/components/features/project-dialog"
import { TaskDialog } from "@/components/features/task-dialog"
import { BacklogDialog } from "@/components/features/backlog-dialog"
import { ProjectMediaHeader } from "@/components/features/project-media-header"
import { ProjectTasksCard } from "@/components/features/project-tasks-card"
import { ProjectTimeProgress } from "@/components/features/project-time-progress"
import { ProjectCronogramaPanel } from "@/components/features/project-cronograma-panel"
import { ProjectHoursStats } from "@/components/features/project-hours-stats"
import { ProjectMembersManagement } from "@/components/features/project-members-management"
import { ProjectDeliverablesPanel } from "@/components/features/project-deliverables-panel"
import { ProjectAttachmentsPanel } from "@/components/features/project-attachments-panel"
import { ProjectTechnicalReportsPanel } from "@/components/features/project-technical-reports-panel"
import { ProjectCertificatesPanel } from "@/components/features/project-certificates-panel"
import { ProjectReportsPanel } from "@/components/features/project-reports-panel"
import { ProjectLeaderLogs } from "@/components/features/project-leader-logs"
import { projectStatusBadgeClass, projectStatusLabel, taskStatusBadgeClass, taskStatusLabel } from "@/components/ui/status"
import { POINTS_PER_TASK } from "@/features/tasks"
import { projectProgress } from "@/features/projects/utils/project-progress"
import { civilDayOfInstant } from "@/backend/domain"
import {
  ArrowLeft, Calendar, CheckCircle2, Clock, FileText, FolderKanban, Link as LinkIcon,
  Plus, Trash2, Upload, Users, Edit, AlertCircle, ExternalLink,
} from "lucide-react"
import type { ProjectMember } from "@/lib/api/project-members"

function formatCivilDay(value?: string | null) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const [year, month, day] = value.split("-")
  return `${day}/${month}/${year}`
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-medium">{children}</dd></div>
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const projectId = Number(params.id)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { tasks, createTask } = useTask()
  const { users } = useUser()
  const [project, setProject] = useState<Project | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingProject, setEditingProject] = useState(false)
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false)
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [isBacklogDialogOpen, setIsBacklogDialogOpen] = useState(false)
  const [linkName, setLinkName] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [activeTab, setActiveTab] = useState("overview")

  const loadProject = useCallback(async () => {
    if (!Number.isInteger(projectId) || projectId <= 0) {
      setLoadError("Projeto não encontrado.")
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const [projectResult, memberRows] = await Promise.all([
        projectsApi.getById(projectId),
        projectsApi.members(projectId),
      ])
      setProject(projectResult.project as unknown as Project)
      setMembers(memberRows.members as unknown as ProjectMember[])
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Não foi possível carregar o projeto.")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { void loadProject() }, [loadProject])

  const projectTasks = useMemo(
    () => tasks.filter(task => task.projectId === project?.id),
    [tasks, project?.id],
  )
  const completedTasks = projectTasks.filter(task => task.status === "done").length
  const pendingTasks = projectTasks.filter(task => task.status === "to-do").length
  const inProgressTasks = projectTasks.filter(task => ["in-progress", "in-review", "adjust"].includes(task.status)).length
  const totalTasks = projectTasks.length
  const completionRate = totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0
  const overallProgress = project ? projectProgress(project, projectTasks, civilDayOfInstant(new Date())) : null

  if (authLoading || loading) {
    return <main className="container mx-auto space-y-4 p-4 md:p-6"><div className="h-8 w-64 animate-pulse rounded bg-muted" /><div className="h-48 animate-pulse rounded border bg-muted/40" /></main>
  }
  if (!user) {
    return <main className="container mx-auto p-4 md:p-6"><p className="text-muted-foreground">Faça login para acessar os projetos.</p></main>
  }
  if (!hasAccess(user.roles || [], "VIEW_PROJECT_DASHBOARD")) {
    return <main className="container mx-auto p-4 md:p-6"><p className="text-muted-foreground">Você não tem permissão para acessar esta página.</p></main>
  }
  if (loadError || !project) {
    return <main className="container mx-auto space-y-4 p-4 md:p-6"><Button variant="outline" onClick={() => router.push("/dashboard/projetos")}><ArrowLeft className="mr-2 h-4 w-4" />Voltar aos projetos</Button><p role="alert" className="text-destructive">{loadError || "Projeto não encontrado."}</p></main>
  }

  const projectStartDate = formatCivilDay(project.startDate)
  const projectEndDate = formatCivilDay(project.endDate)
  const projectPoints = project.points ?? 0
  const hasProjectData = Boolean(projectStartDate || projectEndDate || project.editalNumber || project.processNumber || project.proppiNumber || projectPoints > 0)
  // Mesma expressão medida no diálogo: a tela controla só a visibilidade; o servidor decide a escrita.
  const canManageProjectFiles = Boolean(user && (
    project.leaderId === user.id || hasAccess(user.roles, "MANAGE_USERS") ||
    hasAccess(user.roles, "MANAGE_PROJECTS") ||
    user.roles.some((role: string) => ["COORDENADOR", "GERENTE", "GERENTE_PROJETO"].includes(role))
  ))
  const canManageProjectMembers = Boolean(user && (
    hasAccess(user.roles, "MANAGE_PROJECT_MEMBERS") || user.roles.includes("COORDENADOR") || user.roles.includes("GERENTE")
  ))
  const isProjectLeader = project.leaderId === user.id
  const canViewProjectReports = isProjectLeader || hasAccess(user.roles, "MANAGE_USERS")
  const creator = users.find(person => person.id === project.createdBy)?.name || `Usuário #${project.createdBy}`
  const projectLinks = Array.isArray(project.links) ? project.links as { label: string; url: string }[] : []

  const handleCreateTask = () => { setSelectedTask(null); setIsTaskDialogOpen(true) }
  const handleEditTask = (task: Task) => { setSelectedTask(task); setIsTaskDialogOpen(true) }
  const handleTaskDialogClose = (open: boolean) => { setIsTaskDialogOpen(open); if (!open) setSelectedTask(null) }
  const handleAddLink = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const label = linkName.trim()
    const url = linkUrl.trim()
    if (!label || !url) return
    // Quirk preservado (DEC-183): a lista local do projeto é atualizada por mutação.
    project.links = [...(project.links || []), { label, url }]
    setLinkName("")
    setLinkUrl("")
  }
  const handleDeleteProject = () => {
    if (confirm("Tem certeza que deseja excluir este projeto?")) router.push("/dashboard/projetos")
  }
  const handleEditDialogChange = (open: boolean) => {
    setIsProjectDialogOpen(open)
    if (!open) void loadProject()
  }
  const handleMembersUpdate = () => { void loadProject() }

  return (
    <main className="container mx-auto space-y-6 p-4 md:p-6">
      <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/projetos")} className="-mb-3 w-fit px-0 text-muted-foreground hover:text-foreground">
        <ArrowLeft className="mr-2 h-4 w-4" />Projetos
      </Button>
      <PageHeader
        title={project.name}
        description={project.description || "Detalhes e acompanhamento do projeto"}
        icon={FolderKanban}
        actions={<div className="flex flex-wrap items-center gap-2"><Badge className={projectStatusBadgeClass[project.status]}>{projectStatusLabel[project.status]}</Badge><Button variant="outline" onClick={() => router.push(`/dashboard/weekly-reports?tab=projetos&projectId=${project.id}`)}><FileText className="mr-2 h-4 w-4" />Relatórios</Button>{user && hasAccess(user.roles, "EDIT_PROJECT") && <><Button variant="outline" onClick={() => { setEditingProject(true); setIsProjectDialogOpen(true) }}><Edit className="mr-2 h-4 w-4" />Editar</Button><Button variant="outline" onClick={handleDeleteProject}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button></>}</div>}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0 space-y-5">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-5">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="tasks">Tarefas</TabsTrigger>
            <TabsTrigger value="members" data-value="members">Membros</TabsTrigger>
            <TabsTrigger value="files">Arquivos</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-5">
            <ProjectMediaHeader projectId={project.id} projectName={project.name} logoKey={project.logoKey} bannerKey={project.bannerKey} canManage={canManageProjectFiles} />
            {project.description && <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Descrição</CardTitle></CardHeader><CardContent><p className="text-muted-foreground">{project.description}</p></CardContent></Card>}
            {hasProjectData && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5" />Dados do projeto</CardTitle></CardHeader><CardContent><dl className="grid gap-4 sm:grid-cols-2">{projectStartDate && <DetailField label="Início">{projectStartDate}</DetailField>}{projectEndDate && <DetailField label="Término">{projectEndDate}</DetailField>}{project.editalNumber && <DetailField label="Número do edital">{project.editalNumber}</DetailField>}{project.processNumber && <DetailField label="Número do processo">{project.processNumber}</DetailField>}{project.proppiNumber && <DetailField label="Número PROPPI">{project.proppiNumber}</DetailField>}{projectPoints > 0 && <DetailField label="Pontos do projeto">{projectPoints} pts</DetailField>}<ProjectTimeProgress startDate={project.startDate} endDate={project.endDate} className="sm:col-span-2" /></dl></CardContent></Card>}
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Informações do Projeto</CardTitle></CardHeader><CardContent><div className="grid gap-6 md:grid-cols-2"><section><h2 className="mb-2 font-medium">Detalhes</h2><dl className="space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Criado por</dt><dd className="text-right">{creator}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Data de criação</dt><dd>{new Date(project.createdAt).toLocaleDateString("pt-BR")}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Status</dt><dd><Badge className={projectStatusBadgeClass[project.status]}>{projectStatusLabel[project.status]}</Badge></dd></div></dl></section><section><h2 className="mb-2 font-medium">Resumo</h2><dl className="space-y-2 text-sm"><div className="flex justify-between"><dt className="text-muted-foreground">Total de tarefas</dt><dd>{totalTasks}</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Taxa de conclusão</dt><dd>{completionRate}%</dd></div><div className="flex justify-between"><dt className="text-muted-foreground">Última atualização</dt><dd>{new Date(project.createdAt).toLocaleDateString("pt-BR")}</dd></div></dl></section></div></CardContent></Card>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-5">
            <ProjectCronogramaPanel projectId={project.id} canManage={canManageProjectFiles} leaderId={project.leaderId} initialMembers={members} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Total de Tarefas" value={totalTasks} icon={CheckCircle2} /><StatCard label="Concluídas" value={completedTasks} icon={CheckCircle2} /><StatCard label="Em Progresso" value={inProgressTasks} icon={Clock} /><StatCard label="Pendentes" value={pendingTasks} icon={AlertCircle} /></div>
            <Card><CardHeader><CardTitle>Andamento do projeto</CardTitle><CardDescription>{overallProgress?.source === "time" ? `${overallProgress.percent}% do período decorrido` : `${overallProgress?.detail ?? "0 de 0 tarefas concluídas"} · ${overallProgress?.percent ?? 0}%`}</CardDescription></CardHeader><CardContent><Progress aria-label="Andamento do projeto" value={overallProgress?.percent ?? 0} className="h-2" /><p className="mt-2 text-xs text-muted-foreground">Conclusão de tarefas: {completionRate}% ({completedTasks} de {totalTasks})</p></CardContent></Card>
            <ProjectTasksCard tasks={projectTasks} users={users} canCreate={hasAccess(user.roles, "CREATE_TASK")} onCreateTask={handleCreateTask} onImportBacklog={() => setIsBacklogDialogOpen(true)} onEditTask={handleEditTask} />
          </TabsContent>

          <TabsContent value="members" className="space-y-5">
            <ProjectHoursStats project={project} />
            {canManageProjectMembers && <ProjectMembersManagement project={project} initialMembers={members} onUpdate={handleMembersUpdate} />}
          </TabsContent>

          <TabsContent value="files" className="space-y-5">
            <ProjectDeliverablesPanel projectId={project.id} canManage={canManageProjectFiles} />
            <ProjectAttachmentsPanel projectId={project.id} canManage={canManageProjectFiles} />
            <ProjectTechnicalReportsPanel projectId={project.id} canManage={canManageProjectFiles} />
            <ProjectCertificatesPanel projectId={project.id} canManage={canManageProjectFiles} initialMembers={members} />
            {canViewProjectReports && <ProjectReportsPanel projectId={project.id} />}
          </TabsContent>

          <TabsContent value="settings" className="space-y-5">
            <Card><CardHeader><CardTitle className="flex items-center gap-2"><LinkIcon className="h-5 w-5" />Links</CardTitle><CardDescription>Links associados a este projeto.</CardDescription></CardHeader><CardContent className="space-y-4">{hasAccess(user.roles || [], "EDIT_PROJECT") && <form onSubmit={handleAddLink} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label="Nome do link" placeholder="Nome (ex: Figma, GitHub)" value={linkName} onChange={event => setLinkName(event.target.value)} /><Input aria-label="Endereço do link" placeholder="Link" value={linkUrl} onChange={event => setLinkUrl(event.target.value)} /><Button type="submit" variant="outline"><Plus className="mr-2 h-4 w-4" />Adicionar Link</Button></form>}{projectLinks.length === 0 ? <p className="text-sm text-muted-foreground">Não há links para esse projeto</p> : <ul className="space-y-2">{projectLinks.map((link, index) => <li key={`${link.url}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"><span className="font-medium">{link.label}</span><a className="inline-flex items-center gap-1 text-sm text-primary hover:underline" href={link.url} target="_blank" rel="noopener noreferrer">{link.url}<ExternalLink className="h-3.5 w-3.5" /></a></li>)}</ul>}</CardContent></Card>
            {isProjectLeader && <ProjectLeaderLogs projectId={project.id} />}
          </TabsContent>
        </Tabs>

        <aside className="space-y-4 xl:sticky xl:top-6">
          <Card><CardHeader><CardTitle className="text-base">Informações</CardTitle></CardHeader><CardContent><dl className="space-y-3 text-sm"><div><dt className="text-muted-foreground">Status</dt><dd className="mt-1"><Badge className={projectStatusBadgeClass[project.status]}>{projectStatusLabel[project.status]}</Badge></dd></div><div><dt className="text-muted-foreground">Criado por</dt><dd>{creator}</dd></div><div><dt className="text-muted-foreground">Criado em</dt><dd>{new Date(project.createdAt).toLocaleDateString("pt-BR")}</dd></div>{projectStartDate && <div><dt className="text-muted-foreground">Início</dt><dd>{projectStartDate}</dd></div>}{projectEndDate && <div><dt className="text-muted-foreground">Término</dt><dd>{projectEndDate}</dd></div>}</dl></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Membros</CardTitle><CardDescription>{members.length} membro{members.length === 1 ? "" : "s"} no projeto</CardDescription></CardHeader><CardContent>{project.leaderId && <p className="text-sm"><span className="text-muted-foreground">Líder:</span> {users.find(person => person.id === project.leaderId)?.name || `Usuário #${project.leaderId}`}</p>}<Button variant="link" className="mt-2 h-auto p-0" onClick={() => setActiveTab("members")}>Ver membros</Button></CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" />Atividade</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Projeto criado em {new Date(project.createdAt).toLocaleDateString("pt-BR")}. Atividades recentes não estão disponíveis.</p></CardContent></Card>
        </aside>
      </div>

      <ProjectDialog open={isProjectDialogOpen} onOpenChange={handleEditDialogChange} project={editingProject ? project : null} />
      <TaskDialog open={isTaskDialogOpen} onOpenChange={handleTaskDialogClose} task={selectedTask} projectId={project.id.toString()} />
      <BacklogDialog open={isBacklogDialogOpen} onOpenChange={setIsBacklogDialogOpen} projectId={project.id.toString()} />
    </main>
  )
}
