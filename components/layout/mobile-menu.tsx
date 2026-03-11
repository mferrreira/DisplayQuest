"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Clock,
  FileText,
  FolderKanban,
  Home,
  LogOut,
  Menu,
  Shield,
  ShoppingBag,
  Trophy,
  User,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { hasAccess } from "@/lib/utils/utils"

type MobileNavItem = {
  href: string
  label: string
  icon: typeof Home
  visible: boolean
  active: boolean
}

type MobileNavGroup = {
  label: string
  items: MobileNavItem[]
}

export function MobileMenu() {
  const { user, logout } = useAuth()
  const { users } = useUser()
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const userRoles = user?.roles ?? []
  const currentUserData = user ? users.find((registeredUser) => registeredUser.id === user.id) : null

  useEffect(() => {
    const handleRouteChange = () => setIsOpen(false)
    window.addEventListener("popstate", handleRouteChange)
    return () => window.removeEventListener("popstate", handleRouteChange)
  }, [])

  const handleLogout = () => {
    logout()
    setIsOpen(false)
  }

  const navigationGroups: MobileNavGroup[] = [
    {
      label: "Projetos",
      items: [
        {
          href: "/dashboard",
          label: "Quadro de Tarefas",
          icon: Home,
          visible: true,
          active: pathname === "/dashboard",
        },
        {
          href: "/dashboard/projetos",
          label: "Projetos",
          icon: FolderKanban,
          visible: hasAccess(userRoles, "VIEW_PROJECT_DASHBOARD"),
          active: pathname.startsWith("/dashboard/projetos"),
        },
      ],
    },
    {
      label: "Laboratorio",
      items: [
        {
          href: "/dashboard/laboratorio",
          label: "Laboratorio",
          icon: Clock,
          visible: true,
          active: pathname.startsWith("/dashboard/laboratorio"),
        },
        {
          href: "/dashboard/weekly-reports",
          label: "Relatorios Semanais",
          icon: FileText,
          visible: hasAccess(userRoles, "DASHBOARD_WEEKLY_REPORTS"),
          active: pathname.startsWith("/dashboard/weekly-reports"),
        },
        {
          href: "/dashboard/admin",
          label: "Painel Administrativo",
          icon: Shield,
          visible: hasAccess(userRoles, "DASHBOARD_ADMIN"),
          active: pathname.startsWith("/dashboard/admin"),
        },
      ],
    },
    {
      label: "Pessoal",
      items: [
        {
          href: "/dashboard/profile",
          label: "Perfil",
          icon: User,
          visible: true,
          active: pathname.startsWith("/dashboard/profile"),
        },
        {
          href: "/dashboard/loja",
          label: "Loja",
          icon: ShoppingBag,
          visible: true,
          active: pathname.startsWith("/dashboard/loja"),
        },
        {
          href: "/dashboard/leaderboard",
          label: "Ranking",
          icon: Trophy,
          visible: true,
          active: pathname.startsWith("/dashboard/leaderboard"),
        },
      ],
    },
  ]

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] sm:w-[340px]">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-3">
            <img src="/LOGO.png" alt="Display Quest" className="h-10 w-10" />
            <span className="text-lg font-semibold">Display Quest</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.avatar || undefined} alt={user.name || ""} />
                  <AvatarFallback className="text-sm">
                    {user.name
                      ? user.name
                          .split(" ")
                          .map((namePart) => namePart[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)
                      : "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {userRoles.includes("GERENTE_PROJETO")
                      ? "Gerente de Projeto"
                      : userRoles.includes("COORDENADOR")
                        ? "Coordenador"
                        : userRoles.includes("LABORATORISTA")
                          ? "Laboratorista"
                          : userRoles.includes("VOLUNTARIO")
                            ? "Voluntario"
                            : "Usuario"}
                  </p>
                </div>
              </div>

              {currentUserData ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3 dark:border-emerald-700 dark:from-emerald-900/20 dark:to-teal-900/20">
                  <Trophy className="h-5 w-5 text-amber-500 dark:text-emerald-400" />
                  <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-lg font-semibold text-transparent dark:from-emerald-400 dark:to-teal-400">
                    {currentUserData.points}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <Separator />

          <nav className="space-y-5">
            {navigationGroups.map((group) => {
              const visibleItems = group.items.filter((item) => item.visible)

              if (visibleItems.length === 0) {
                return null
              }

              return (
                <div key={group.label} className="space-y-2">
                  <p className="px-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {group.label}
                  </p>
                  <div className="space-y-1">
                    {visibleItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                          item.active
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </nav>

          <Separator />

          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
            <span className="text-sm font-medium">Tema</span>
            <ThemeToggle />
          </div>

          <Button variant="outline" onClick={handleLogout} className="w-full justify-start gap-3">
            <LogOut className="h-5 w-5" />
            Sair
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
