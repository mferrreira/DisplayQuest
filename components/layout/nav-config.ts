/**
 * Navigation single source (E1/T1.4).
 * ONE declarative structure consumed by BOTH app-header.tsx and mobile-menu.tsx.
 * Visibility derives exclusively from lib/auth/features.ts FEATURE_ACCESS (constitution §4,
 * R5 drift prevention). Adding a destination = edit this file only.
 */
import {
  Clock,
  FileText,
  FolderKanban,
  Home,
  Shield,
  ShoppingBag,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react"
import { hasFeatureAccess, type FeatureAccess } from "@/lib/auth/features"

export interface NavItemDef {
  href: string
  label: string
  icon: LucideIcon
  /** Omit = visible to every authenticated user. */
  feature?: FeatureAccess
  /** active when pathname starts with href (default: exact match). */
  matchPrefix?: boolean
}

export interface NavGroupDef {
  label: string
  items: NavItemDef[]
}

const NAVIGATION_GROUPS: NavGroupDef[] = [
  {
    label: "Projetos",
    items: [
      { href: "/dashboard", label: "Quadro de Tarefas", icon: Home },
      {
        href: "/dashboard/projetos",
        label: "Projetos",
        icon: FolderKanban,
        feature: "VIEW_PROJECT_DASHBOARD",
        matchPrefix: true,
      },
    ],
  },
  {
    label: "Laboratório",
    items: [
      { href: "/dashboard/laboratorio", label: "Laboratório", icon: Clock, matchPrefix: true },
      {
        href: "/dashboard/weekly-reports",
        label: "Relatórios Semanais",
        icon: FileText,
        feature: "DASHBOARD_WEEKLY_REPORTS",
        matchPrefix: true,
      },
      {
        href: "/dashboard/admin",
        label: "Painel Administrativo",
        icon: Shield,
        feature: "DASHBOARD_ADMIN",
        matchPrefix: true,
      },
    ],
  },
  {
    label: "Pessoal",
    items: [
      { href: "/dashboard/profile", label: "Perfil", icon: User, matchPrefix: true },
      { href: "/dashboard/loja", label: "Loja", icon: ShoppingBag, matchPrefix: true },
      { href: "/dashboard/leaderboard", label: "Ranking", icon: Trophy, matchPrefix: true },
    ],
  },
]

export function isNavItemActive(item: NavItemDef, pathname: string): boolean {
  return item.matchPrefix ? pathname.startsWith(item.href) : pathname === item.href
}

/** Groups filtered by the user's roles; items keep raw defs (active computed by consumers). */
export function getNavigationGroups(
  userRoles: unknown,
): Array<{ label: string; items: Array<NavItemDef & { visible: true }> }> {
  const groups: Array<{ label: string; items: Array<NavItemDef & { visible: true }> }> = []
  for (const group of NAVIGATION_GROUPS) {
    const items = group.items.filter((item) => !item.feature || hasFeatureAccess(userRoles, item.feature))
    if (items.length > 0) {
      groups.push({ label: group.label, items: items.map((item) => ({ ...item, visible: true as const })) })
    }
  }
  return groups
}

/** Primary role label for identity surfaces (header dropdown, mobile menu card). */
export function getPrimaryRoleLabel(userRoles: unknown): string {
  const roles = Array.isArray(userRoles) ? userRoles.map(String) : []
  if (roles.includes("GERENTE_PROJETO")) return "Gerente de Projeto"
  if (roles.includes("COORDENADOR")) return "Coordenador"
  if (roles.includes("LABORATORISTA")) return "Laboratorista"
  if (roles.includes("GERENTE")) return "Gerente"
  if (roles.includes("PESQUISADOR")) return "Pesquisador"
  if (roles.includes("COLABORADOR")) return "Colaborador"
  if (roles.includes("VOLUNTARIO")) return "Voluntário"
  return "Usuário"
}
