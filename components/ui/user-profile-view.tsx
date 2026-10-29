"use client"

/**
 * UserProfileView — o perfil de OUTRA pessoa (leitura; a escrita e do dono).
 *
 * V6-7 (reimaginacao): nada de grade de caixas. A identidade e um plano unico com a capa e o avatar
 * sobrepostos; os numeros sao uma faixa de fatos sobre reguas finas; o resto sao secoes abertas.
 * O que a tela mostra nao muda: os dados de pessoa abertos (V5-4a/DEC-138) seguem em "Dados para os
 * documentos", e o CPF continua fora — este componente nao recebe o CPF pela lista.
 */
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { userImageUrl } from "@/lib/api/user-images"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { getRoleDisplayName } from "@/lib/utils/access-control"
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Clock,
  FileText,
  FolderKanban,
  GitCommitHorizontal,
  Mail,
  ShieldCheck,
  Target,
  Trophy,
  User as UserIcon,
} from "lucide-react"
import { User as UserType } from "@/contexts/types"
import {
  FUNDING_AGENCY_LABELS,
  SCHOLARSHIP_TYPE_LABELS,
  USER_LEVEL_LABELS,
  type FundingAgency,
  type ScholarshipType,
  type UserLevel,
} from "@/backend/domain"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { UserBadges } from "@/components/ui/user-badges"
import { ProfileMonthsList } from "@/components/ui/profile-months-list"

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

function ProfileSection({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  title: string
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className="border-t border-border pt-6">
      <h3 id={id} className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  )
}

function Fact({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: React.ReactNode
  hint: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="border-t border-border pt-4">
      <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="mt-1 text-3xl font-bold tabular-nums leading-none">{value}</dd>
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  )
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

  const showPersonData = Boolean(
    user.course || user.registrationNumber || user.scholarshipType || user.level || user.fundingAgency,
  )

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Perfil do Usuário"
        description="Dados de contato, formação e participação em projetos."
        icon={UserIcon}
        actions={
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Voltar
          </Button>
        }
      />

      {/* Identidade — um plano so: capa, avatar sobreposto, nome e funcoes. */}
      <section className="overflow-hidden rounded-2xl border border-border">
        <div className="relative">
          {/* S05 (R4): faixa 16:9 (`aspect-video`), sem altura fixa. */}
          <div className="aspect-video overflow-hidden bg-primary/10">
            {user.bannerKey ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={userImageUrl(user.id, "banner", user.bannerKey)}
                  alt={`Capa de ${user.name}`}
                  className="h-full w-full object-cover"
                />
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-medium text-primary/70">
                Sem capa
              </div>
            )}
          </div>
          <Avatar className="absolute bottom-0 left-6 h-24 w-24 translate-y-1/3 border-4 border-background bg-background sm:h-28 sm:w-28">
            <AvatarImage src={user.avatar || undefined} alt={user.name} />
            <AvatarFallback className="text-2xl font-bold">{getInitials(user.name)}</AvatarFallback>
          </Avatar>
        </div>

        <div className="flex flex-col gap-3 px-6 pb-6 pt-16 sm:flex-row sm:items-end sm:justify-between sm:px-8">
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{user.name}</h2>
            <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4" aria-hidden="true" />
              <span className="truncate">{user.email}</span>
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {user.roles.length > 0 && (
              <p className="text-sm text-muted-foreground">{user.roles.map(getRoleDisplayName).join(" · ")}</p>
            )}
            {user.createdAt ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                Membro desde {safeFormatDistance(user.createdAt)}
              </p>
            ) : null}
            {canEdit && onEdit && (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <UserIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                Editar Perfil
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Fatos — rotulo quieto + algarismo grande sobre a regua, sem caixa. */}
      <dl aria-label="Resumo do usuário" className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
        <Fact label="Placar do mês" value={user.currentMonthPoints ?? 0} hint="zera na virada" icon={GitCommitHorizontal} />
        <Fact label="Pontos" value={user.points} hint="pontos acumulados" icon={Trophy} />
        <Fact label="Tarefas" value={user.completedTasks} hint="tarefas concluídas" icon={Target} />
        <Fact label="Horas/Sem" value={user.weekHours} hint="meta semanal" icon={Clock} />
        <Fact label="Funções" value={user.roles.length} hint="papéis no laboratório" icon={ShieldCheck} />
      </dl>

      {(user.bio || showPersonData || user.roles.length > 0 || projectNames.length > 0) && (
        <div className="space-y-6">
          {user.bio && (
            <ProfileSection id="profile-about" icon={BookOpen} title="Sobre">
              <p className="leading-relaxed text-foreground/90">{user.bio}</p>
            </ProfileSection>
          )}

          {/* V5-4a (DEC-138): os dados de pessoa que o perfil mostra abertamente. O bloco só
              aparece quando algum deles existe, e o CPF fica de fora de propósito — este componente
              também renderiza o perfil de outra pessoa, e o CPF não chega na lista de usuários. */}
          {showPersonData && (
            <ProfileSection id="profile-person-data" icon={FileText} title="Dados para os documentos">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {user.course && (
                  <div className="border-t border-border pt-3">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Curso</dt>
                    <dd className="text-sm text-foreground">{user.course}</dd>
                  </div>
                )}
                {user.registrationNumber && (
                  <div className="border-t border-border pt-3">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Matrícula</dt>
                    <dd className="text-sm text-foreground">{user.registrationNumber}</dd>
                  </div>
                )}
                {user.scholarshipType && (
                  <div className="border-t border-border pt-3">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Modalidade de IC</dt>
                    <dd className="text-sm text-foreground">
                      {SCHOLARSHIP_TYPE_LABELS[user.scholarshipType as ScholarshipType] ?? user.scholarshipType}
                    </dd>
                  </div>
                )}
                {user.level && (
                  <div className="border-t border-border pt-3">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nível</dt>
                    <dd className="text-sm text-foreground">
                      {USER_LEVEL_LABELS[user.level as UserLevel] ?? user.level}
                    </dd>
                  </div>
                )}
                {user.fundingAgency && (
                  <div className="border-t border-border pt-3">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Instituição de fomento</dt>
                    <dd className="text-sm text-foreground">
                      {user.fundingAgency === "OUTRA" && user.fundingAgencyOther
                        ? user.fundingAgencyOther
                        : FUNDING_AGENCY_LABELS[user.fundingAgency as FundingAgency] ?? user.fundingAgency}
                    </dd>
                  </div>
                )}
              </dl>
            </ProfileSection>
          )}

          <ProfileSection id="profile-roles" icon={ShieldCheck} title="Funções">
            {user.roles.length > 0 ? (
              <p className="text-sm text-foreground">{user.roles.map(getRoleDisplayName).join(" · ")}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sem funções atribuídas.</p>
            )}
          </ProfileSection>

          <ProfileSection id="profile-projects" icon={FolderKanban} title="Projetos">
            {projectNames.length > 0 ? (
              <ul className="space-y-1.5">
                {projectNames.map((projectName) => (
                  <li key={projectName} className="flex items-center gap-2 text-sm text-foreground">
                    <span className="h-1 w-1 rounded-full bg-primary" aria-hidden="true" />
                    {projectName}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum projeto vinculado no momento.</p>
            )}
          </ProfileSection>

        </div>
      )}

      {/* plan-v9 S04 (DEC-232): os meses fechados da pessoa, a mesma lista do perfil próprio.
          Fora do condicional de propósito: pessoa sem "Sobre", "Funções" e "Projetos" também
          tem histórico de meses, e a lista do perfil de terceiro acompanha a do próprio. */}
      <ProfileSection id="profile-months" icon={Trophy} title="Meses fechados">
        <ProfileMonthsList userId={user.id} />
      </ProfileSection>

      <div className="border-t border-border pt-6">
        <UserBadges userId={user.id} limit={8} />
      </div>
    </div>
  )
}
