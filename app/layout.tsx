import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import ClientLayout from "./client-layout"
import { initCronService } from "@/lib/services/init-cron"
import { getServerSession } from "next-auth"
import { authOptions } from "./api/auth/[...nextauth]/route"

// Inicializar o serviço de cron no servidor
if (typeof window === 'undefined') {
  initCronService()
}

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Sistema de Gerenciamento de Tarefas",
  description: "Aplicativo de gerenciamento de tarefas com quadro Kanban",
  generator: 'v0.dev'
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <ClientLayout session={session}>{children}</ClientLayout>
      </body>
    </html>
  )
}