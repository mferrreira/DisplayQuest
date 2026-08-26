/**
 * Not-found page (E1/T1.3). pt-BR copy; offers the two main destinations.
 */
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="font-mono text-4xl font-bold text-muted-foreground/40">404</p>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Página não encontrada</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/dashboard">Ir para o painel</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/login">Entrar</Link>
        </Button>
      </div>
    </div>
  )
}
