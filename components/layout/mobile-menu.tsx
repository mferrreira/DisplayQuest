"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { useUser } from "@/contexts/user-context"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { 
  Menu, 
  X, 
  KanbanSquare, 
  User, 
  FolderKanban, 
  Trophy, 
  ShoppingBag, 
  Clock,
  LogOut,
  Settings,
  Home,
  FileText
} from "lucide-react"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function MobileMenu() {
  const { user, logout } = useAuth()
  const { users } = useUser()
  const [isOpen, setIsOpen] = useState(false)

  // Fechar o menu quando uma rota muda
  useEffect(() => {
    const handleRouteChange = () => setIsOpen(false)
    window.addEventListener('popstate', handleRouteChange)
    return () => window.removeEventListener('popstate', handleRouteChange)
  }, [])

  // Encontrar usuário atual para obter pontos
  const currentUserData = user ? users.find((u) => u.id === parseInt(user.id)) : null

  const handleLogout = () => {
    logout()
    setIsOpen(false)
  }

  const navigationItems = [
    {
      href: "/dashboard",
      icon: Home,
      label: "Dashboard",
      show: true
    },
    {
      href: "/dashboard/projetos",
      icon: FolderKanban,
      label: "Projetos",
              show: user?.roles?.includes("GERENTE_PROJETO") || user?.roles?.includes("LABORATORISTA") || user?.roles?.includes("COORDENADOR")
    },
    {
      href: "/dashboard/leaderboard",
      icon: Trophy,
      label: "Ranking",
      show: true
    },
    {
      href: "/dashboard/loja",
      icon: ShoppingBag,
      label: "Loja",
      show: true
    },
    {
      href: "/dashboard/laboratorio",
      icon: Clock,
      label: "Laboratório",
      show: true
    },
    {
      href: "/dashboard/weekly-reports",
      icon: FileText,
      label: "Relatórios Semanais",
      show: user?.roles?.includes("COORDENADOR") || user?.roles?.includes("LABORATORISTA")
    },
    {
      href: "/dashboard/admin",
      icon: User,
      label: "Painel Administrativo",
      show: user?.roles?.includes("COORDENADOR")
    },
    {
      href: "/dashboard/profile",
      icon: User,
      label: "Perfil",
      show: true
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
      <SheetContent side="left" className="w-[280px] sm:w-[320px]">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <img src="/LOGO.png" className="h-10 w-10 text-primary" />
            <span className="text-lg font-semibold">Display Quest</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* User Info */}
          {user && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user?.avatar || undefined} alt={user?.name || ''} />
                  <AvatarFallback className="text-sm">
                    {user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{user.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {user?.roles.includes("GERENTE_PROJETO") ? "Gerente de Projeto" : user?.roles.includes("COORDENADOR") ? "Coordenador" : user?.roles.includes("LABORATORISTA") ? "Laboratorista" : user?.roles.includes("VOLUNTARIO") ? "Voluntário" : "Usuário"}
                  </p>
                </div>
              </div>
              
              {currentUserData && (
                <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-amber-200 dark:border-emerald-700">
                  <Trophy className="h-5 w-5 text-amber-500 dark:text-emerald-400" />
                  <span className="font-semibold text-lg bg-gradient-to-r from-amber-600 to-orange-600 dark:from-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                    {currentUserData.points}
                  </span>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Navigation */}
          <nav className="space-y-1">
            {navigationItems
              .filter(item => item.show)
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className="flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              ))}
          </nav>

          <Separator />

          {/* Theme Toggle */}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-medium">Tema</span>
            <ThemeToggle />
          </div>

          {/* Logout */}
          <div className="pt-4">
            <Button
              variant="outline"
              onClick={handleLogout}
              className="w-full justify-start gap-3"
            >
              <LogOut className="h-5 w-5" />
              Sair
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
} 