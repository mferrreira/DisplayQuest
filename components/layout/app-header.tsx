"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, Trophy } from "lucide-react"
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
import {
  getNavigationGroups,
  getPrimaryRoleLabel,
  isNavItemActive,
  type NavGroupDef,
  type NavItemDef,
} from "@/components/layout/nav-config"

type NavItem = NavItemDef & { active: boolean }

type NavGroup = Pick<NavGroupDef, "label"> & {
  items: NavItem[]
}

type GroupedNavMenuProps = {
  group: NavGroup
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}

function GroupedNavMenu({ group, isOpen, onOpen, onClose }: GroupedNavMenuProps) {
  const visibleItems = group.items
  const isActive = visibleItems.some((item) => item.active)

  if (visibleItems.length === 0) {
    return null
  }

  if (visibleItems.length === 1) {
    const item = visibleItems[0]

    return (
      <Link
        href={item.href}
        className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition-colors ${
          item.active
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        {group.label}
      </Link>
    )
  }

  return (
    <div className="relative" onMouseEnter={onOpen} onMouseLeave={onClose}>
      <button
        type="button"
        className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
          isActive || isOpen
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
        onFocus={onOpen}
        aria-expanded={isOpen}
      >
        {group.label}
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen ? (
        <div className="absolute left-1/2 top-full z-50 w-64 -translate-x-1/2 pt-3">
          <div className="rounded-2xl border bg-background/95 p-2 shadow-lg backdrop-blur">
            {visibleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  item.active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function AppHeader() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const userRoles = user?.roles ?? []
  // Points come from the session (jwt callback enriches from DB) — no all-users fetch needed.
  const points = user?.points ?? null

  // Single navigation source: components/layout/nav-config.ts
  const navigationGroups = getNavigationGroups(userRoles).map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, active: isNavItemActive(item, pathname) })),
  }))

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto grid h-16 grid-cols-[auto_1fr_auto] items-center gap-4 px-4">
        <div className="flex items-center gap-3">
          <MobileMenu />
          <Link href="/dashboard" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <img src="/LOGO.png" alt="Display Quest" className="h-10 w-10" />
            <span className="hidden text-lg font-semibold sm:inline">Display Quest</span>
          </Link>
        </div>

        <nav className="hidden items-center justify-center gap-3 md:flex">
          {navigationGroups.map((group) => (
            <GroupedNavMenu
              key={group.label}
              group={group}
              isOpen={openGroup === group.label}
              onOpen={() => setOpenGroup(group.label)}
              onClose={() => setOpenGroup(null)}
            />
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <div className="hidden items-center gap-2 md:flex">
            {points !== null ? (
              <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-1.5 dark:border-emerald-700 dark:from-emerald-900/20 dark:to-teal-900/20">
                <Trophy className="h-4 w-4 text-amber-500 dark:text-emerald-400" />
                <span className="bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-sm font-semibold text-transparent dark:from-emerald-400 dark:to-teal-400">
                  {points}
                </span>
              </div>
            ) : null}

            <NotificationsPanel />
            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 rounded-full">
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
                      <span className="mt-1 bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-xs font-medium text-transparent dark:from-emerald-400 dark:to-teal-400">
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
