import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { canAccessAdminPanel } from "@/lib/utils/access-control"

/**
 * Guarda de servidor do Painel Administrativo (V6-9, RF-V6.14 R3 / RF-V6.16 S3).
 *
 * Antes o `admin/page.tsx` decidia no cliente com a mesma lista de `DASHBOARD_ADMIN` e a
 * negativa era um corpo servido com HTTP 200. A decisão que PODE NEGAR agora mora aqui, no
 * servidor: quem não porta `DASHBOARD_ADMIN ∪ DASHBOARD_VOLUNTEERS` nem renderiza o painel.
 * O `(dashboard)/layout.tsx` já redireciona sem sessão, então aqui a sessão existe.
 *
 * A frase de negação preserva a que existia no corpo do cliente (`h2 "Acesso Negado"`).
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  const roles = (session?.user as { roles?: unknown } | undefined)?.roles

  if (!canAccessAdminPanel(roles)) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1 container mx-auto p-4 md:p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">Acesso Negado</h2>
              <p className="text-muted-foreground">
                Você não tem permissão para acessar o painel administrativo.
              </p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  return <>{children}</>
}
