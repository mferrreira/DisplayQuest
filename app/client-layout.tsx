"use client"

import { ThemeProvider } from "@/components/layout/theme-provider"
import { UserProvider } from "@/contexts/user-context"
import { ProjectProvider } from "@/contexts/project-context"
import { TaskProvider } from "@/contexts/task-context"
import { WorkSessionsProvider } from "@/contexts/work-sessions-context"
import { SessionProvider } from "next-auth/react"
import { AppHeader } from "@/components/layout/app-header"
import { FloatingSessionTimer } from "@/components/ui/floating-session-timer"
import { QueryProvider } from "@/shared/providers/query-provider"
import { Toaster } from "@/components/ui/sonner"
import { usePathname } from "next/navigation"
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
          {shouldProvideTasks ? <TaskProvider>{children}</TaskProvider> : children}
        </WorkSessionsProvider>
      </ProjectProvider>
    </UserProvider>
  )
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDashboardRoute = pathname.startsWith("/dashboard")

  if (!isDashboardRoute) {
    return <>{children}</>
  }

  return (
    <DashboardProviders>
      <AppHeader />
      <FloatingSessionTimer />
      {children}
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
        <QueryProvider>
          {/* Global toast surface (E1/T1.3): sonner only. Legacy useToast() shim renders here. */}
          <Toaster richColors closeButton position="bottom-right" />
          <LayoutContent>{children}</LayoutContent>
        </QueryProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}
