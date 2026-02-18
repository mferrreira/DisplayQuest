"use client"

import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { ModernButton } from "@/components/ui/modern-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { User, FolderKanban, Trophy, ShoppingBag, Clock, FileText } from "lucide-react"
import { useUser } from "@/contexts/user-context"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { MobileMenu } from "@/components/layout/mobile-menu"
import { NotificationsPanel } from "@/components/ui/notifications-panel"
import { usePathname } from "next/navigation"
import { ACCESS_CONTROL, hasAccess } from "@/lib/utils/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function AppHeader() {
  const { user, logout } = useAuth()
  const { users } = useUser()
  const pathname = usePathname()

  const currentUserData = user ? users.find((u) => u.id === user.id) : null

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-4">

          <MobileMenu />

          <Link href="/dashboard" className={`flex items-center gap-2 hover:opacity-80 transition-opacity ${pathname === "/dashboard" ? "bg-accent text-accent-foreground px-3 py-2 rounded-md" : ""}`}>
            <img src="/LOGO.png" className="h-10 w-10 text-primary" />
            <span className="font-semibold text-lg hidden sm:inline">Display Quest</span>

          </Link>

          <div className="hidden md:flex items-center gap-2">

            {/* Link para leaderboard (todos os usuários) */}
            <Link
              href="/dashboard/leaderboard"
              className={`text-sm flex items-center gap-1 transition-colors duration-200 px-3 py-2 rounded-md ${pathname.startsWith("/dashboard/leaderboard") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
            >
              <Trophy className="h-5 w-5" />
              Ranking
            </Link>


            {/* Link para loja (todos os usuários) */}
            <Link
              href="/dashboard/loja"
              className={`text-sm flex items-center gap-1 transition-colors duration-200 px-3 py-2 rounded-md ${pathname.startsWith("/dashboard/loja") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
            >
              <ShoppingBag className="h-5 w-5" />
              Loja
            </Link>

            {/* Link para responsabilidade do laboratório (todos os usuários) */}
            <Link
              href="/dashboard/laboratorio"
              className={`text-sm flex items-center gap-1 transition-colors duration-200 px-3 py-2 rounded-md ${pathname.startsWith("/dashboard/laboratorio") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
            >
              <Clock className="h-5 w-5" />
              Laboratório
            </Link>

            {/* Future pages for laboratorists and admins */}
            {hasAccess(user?.roles || [], 'VIEW_PROJECT_DASHBOARD') && (
              <Link
                href="/dashboard/projetos"
                className={`text-sm flex items-center gap-1 transition-colors duration-200 px-3 py-2 rounded-md ${pathname.startsWith("/dashboard/projetos") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
              >
                <FolderKanban className="h-5 w-5" />
                Projetos
              </Link>
            )}
            
            {/* Weekly Reports for admins and laboratorists */}
            {hasAccess(user?.roles || [], 'DASHBOARD_WEEKLY_REPORTS') && (
              <Link
                href="/dashboard/weekly-reports"
                className={`text-sm flex items-center gap-1 transition-colors duration-200 px-3 py-2 rounded-md ${pathname.startsWith("/dashboard/weekly-reports") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
              >
                <FileText className="h-5 w-5" />
                Relatórios Semanais
              </Link>
            )}
            
            {hasAccess(user?.roles || [], 'DASHBOARD_ADMIN') && (
              <Link
                href="/dashboard/admin"
                className={`text-sm flex items-center gap-1 transition-colors duration-200 px-3 py-2 rounded-md ${pathname.startsWith("/dashboard/admin") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
              >
                <User className="h-5 w-5" />
                Painel Administrativo
              </Link>
            )}
            {/* Useful future pages for all users */}
            <Link
              href="/dashboard/profile"
              className={`text-sm flex items-center gap-1 transition-colors duration-200 px-3 py-2 rounded-md ${pathname.startsWith("/dashboard/profile") ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}
            >
              <User className="h-5 w-5" />
              Perfil
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4">

          {/* Desktop Controls */}
          <div className="hidden md:flex items-center gap-4">
            
            {currentUserData && (
              <div className="flex items-center gap-2 mr-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-50 to-orange-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-amber-200 dark:border-emerald-700">
                <Trophy className="h-4 w-4 text-amber-500 dark:text-emerald-400" />
                <span className="font-semibold text-sm bg-gradient-to-r from-amber-600 to-orange-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                  {currentUserData.points}
                </span>
              </div>
            )}
            
            <ThemeToggle />
            
            <NotificationsPanel />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ModernButton variant="outline" size="sm" className="gap-2 hover:bg-accent hover:text-accent-foreground transition-colors duration-200">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user?.avatar || undefined} alt={user?.name || ''} />
                    <AvatarFallback className="text-xs">
                      {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                  {user?.name}
                </ModernButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{user?.name}</span>
                    <span className="text-xs text-muted-foreground">{user?.email}</span>
                    <span className="text-xs font-normal mt-1 capitalize">
                      {user?.roles.includes("GERENTE_PROJETO") ? "Gerente de Projeto" : user?.roles.includes("COORDENADOR") ? "Coordenador" : user?.roles.includes("LABORATORISTA") ? "Laboratorista" : user?.roles.includes("VOLUNTARIO") ? "Voluntário" : "Usuário"}
                    </span>
                    {currentUserData && (
                      <span className="text-xs font-medium mt-1 bg-gradient-to-r from-amber-400 to-orange-400 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                        {currentUserData.points} pontos
                      </span>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/loja">Meus Prêmios</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  )
}
