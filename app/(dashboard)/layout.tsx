import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth/config"

/**
 * (dashboard) route group layout — SERVER-side session guard (E1/T1.2).
 *
 * Additive during migration: client-side redirects remain in client-layout; this closes the gap
 * where /dashboard* rendered chrome before any client-side auth check ran. Providers/chrome stay
 * in client-layout until E1/T1.4 rebuilds the shell.
 */
export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect("/login")
  }

  return <>{children}</>
}
