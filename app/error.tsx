"use client"

/**
 * Route-segment error boundary (E1/T1.3). Catches render/data errors below the root layout.
 * pt-BR copy; retry re-renders the segment. Global chrome (header/providers) stays mounted.
 */
import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface for diagnostics without leaking details to the UI copy.
    console.error("[app/error]", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Algo deu errado</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Ocorreu um erro inesperado ao carregar esta seção. Tente novamente.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-muted-foreground/70">ref: {error.digest}</p>
        ) : null}
      </div>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  )
}
