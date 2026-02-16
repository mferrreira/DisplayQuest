"use client"

import { ThemeProvider } from "@/components/layout/theme-provider"
import { UserProvider } from "@/contexts/user-context"
import { ProjectProvider } from "@/contexts/project-context"
import { TaskProvider } from "@/contexts/task-context"
import { SessionProvider } from "next-auth/react"
import { AppHeader } from "@/components/layout/app-header"
import { FloatingSessionTimer } from "@/components/ui/floating-session-timer"
import { usePathname } from "next/navigation"

function DashboardProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const shouldProvideTasks =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/projetos") ||
    pathname.startsWith("/dashboard/admin")

  return (
    <UserProvider>
      <ProjectProvider>
        {shouldProvideTasks ? <TaskProvider>{children}</TaskProvider> : children}
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
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
        <LayoutContent>{children}</LayoutContent>
      </ThemeProvider>
    </SessionProvider>
  )
}
