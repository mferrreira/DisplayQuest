"use client"

import { ThemeProvider } from "@/components/layout/theme-provider"
import { UserProvider } from "@/contexts/user-context"
import { ProjectProvider } from "@/contexts/project-context"
import { TaskProvider } from "@/contexts/task-context"
import { WorkSessionsProvider } from "@/contexts/work-sessions-context"
import { ResponsibilityProvider } from "@/contexts/responsibility-context"
import { SessionProvider } from "next-auth/react"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { QueryProvider } from "@/shared/providers/query-provider"
import { Toaster } from "@/components/ui/sonner"
import { NotificationSound } from "@/components/ui/notification-sound"
import { usePathname } from "next/navigation"
import { useCallback, useState } from "react"
import { useSidebarOutsideClick } from "@/components/layout/use-sidebar-outside-click"
import type { Session } from "next-auth"

function DashboardProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const shouldProvideTasks =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/projetos") ||
    pathname.startsWith("/dashboard/admin")

  return (
    <UserProvider>
      <ProjectProvider>
        <WorkSessionsProvider>
          <ResponsibilityProvider>
            {shouldProvideTasks ? <TaskProvider>{children}</TaskProvider> : children}
          </ResponsibilityProvider>
        </WorkSessionsProvider>
      </ProjectProvider>
    </UserProvider>
  )
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  // A Home nasce com a largura toda disponível; a navegação abre por cima do conteúdo.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  useSidebarOutsideClick(sidebarOpen, closeSidebar)
  const isDashboardRoute = pathname.startsWith("/dashboard")
  // Print/PDF route: hide the session timer dock in the sidebar on exported PDFs.
  const isPrintRoute = /^\/dashboard\/.*\/print$/.test(pathname)

  if (!isDashboardRoute) {
    return <>{children}</>
  }

  return (
    <DashboardProviders>
      {/* Som de notificação: precisa estar montado uma vez só, fora do painel, porque o
          painel é montado duas vezes no cabeçalho (versão de mesa e versão compacta) e o
          som tocaria em dobro. */}
      <NotificationSound />
      <AppHeader sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((open) => !open)} />
      {/* Refinamento V6-3: sidebar fixa sobre o conteúdo, fora do fluxo para não reduzir
          a largura do quadro. Em telas estreitas, a navegação segue no Sheet; o cronômetro
          permanece encaixado no canto inferior. */}
      <div className="flex min-h-[calc(100vh-4rem)]">
        <AppSidebar open={sidebarOpen} showSessionTimer={!isPrintRoute} />
        <div className="min-w-0 flex-1">
          {children}
        </div>
      </div>
    </DashboardProviders>
  )
}

export default function ClientLayout({
  children,
  session,
}: Readonly<{
  children: React.ReactNode
  session?: Session | null
}>) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false} refetchInterval={0}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        {/* nuqs adapter required by useQueryState (E2 URL state) */}
        <NuqsAdapter>
          <QueryProvider>
            {/* Global toast surface (E1/T1.3): sonner only. Legacy useToast() shim renders here. */}
            <Toaster richColors closeButton position="bottom-right" />
            <LayoutContent>{children}</LayoutContent>
          </QueryProvider>
        </NuqsAdapter>
      </ThemeProvider>
    </SessionProvider>
  )
}
