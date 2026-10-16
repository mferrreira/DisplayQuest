"use client"

import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { MobileMenu } from "@/components/layout/mobile-menu"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Button } from "@/components/ui/button"
import { NotificationsPanel } from "@/components/ui/notifications-panel"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PointsCounter, PointsDelta } from "@/components/ui/points-delta"
import { Menu, Trophy } from "lucide-react"
import { getPrimaryRoleLabel } from "@/components/layout/nav-config"

/**
 * AppHeader — plan-v6 · V6-2 (RF-V6.3, DEC-106, AC-V6-08/09).
 *
 * O header compacto: identidade, controle da sidebar desktop, sino, tema e avatar.
 * A navegação saiu dos pills do topo e foi para a `AppSidebar` (desktop) e para o `Sheet`
 * (mobile) — o `<header>` permanece no DOM, travado por tests/e2e/shell.spec.ts.
 * O chip de pontos perdeu o degradê e a paleta crua (RF-V6.1): só token semântico.
 */
interface AppHeaderProps {
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
}

export function AppHeader({ sidebarOpen = true, onToggleSidebar }: AppHeaderProps) {
  const { user, logout } = useAuth()
  const userRoles = user?.roles ?? []
  // Points come from the session (jwt callback enriches from DB) — no all-users fetch needed.
  const points = user?.points ?? null

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="relative flex h-16 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-3 md:pl-10">
          {onToggleSidebar ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute left-4 top-1/2 hidden -translate-y-1/2 md:inline-flex"
              aria-label={sidebarOpen ? "Recolher menu lateral" : "Abrir menu lateral"}
              aria-expanded={sidebarOpen}
              aria-controls="primary-navigation-sidebar"
              title={sidebarOpen ? "Recolher menu lateral" : "Abrir menu lateral"}
              onClick={onToggleSidebar}
            >
              <Menu
                className={`h-5 w-5 transition-transform duration-300 ease-in-out ${sidebarOpen ? "rotate-0" : "rotate-90"}`}
                aria-hidden="true"
              />
            </Button>
          ) : null}
          <MobileMenu />
          <Link href="/dashboard" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <img src="/LOGO.png" alt="Display Quest" className="h-10 w-10" />
            <span className="hidden text-lg font-semibold sm:inline">Display Quest</span>
          </Link>
        </div>

        <div className="flex items-center justify-end gap-2">
          <div className="hidden items-center gap-2 md:flex">
            {points !== null ? (
              <div className="relative flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5">
                <Trophy className="h-4 w-4 text-warning" aria-hidden="true" />
                <span className="text-sm font-semibold">
                  {/* V4-2 (DEC-59): quem conta gradualmente é este número, não o chip.
                      V4-3 (DEC-58): o `userId` é o que permite animar uma mudança que chegou por
                      refresh/login — a baseline do último total visto é por pessoa. */}
                  <PointsCounter points={points} userId={user?.id} />
                </span>
                {/* plan-v3 OND4-B: o prêmio desta entrega, ancorado no contador que ele explica. */}
                <PointsDelta />
              </div>
            ) : null}

            <NotificationsPanel />
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user?.avatar || undefined} alt={user?.name || ""} />
                    <AvatarFallback className="text-xs">
                      {user?.name
                        ? user.name
                            .split(" ")
                            .map((namePart) => namePart[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)
                        : "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="max-w-32 truncate">{user?.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span>{user?.name}</span>
                    <span className="text-xs text-muted-foreground">{user?.email}</span>
                    <span className="mt-1 text-xs font-normal">
                      {getPrimaryRoleLabel(userRoles)}
                    </span>
                    {points !== null ? (
                      <span className="mt-1 text-xs font-medium text-warning">
                        {points} pontos
                      </span>
                    ) : null}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile">Meu Perfil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/loja">Meus Premios</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="md:hidden">
            <NotificationsPanel />
          </div>
        </div>
      </div>
    </header>
  )
}
