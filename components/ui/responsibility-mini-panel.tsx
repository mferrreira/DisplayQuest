"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, Play, Square } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/contexts/auth-context"
import { useResponsibility } from "@/contexts/responsibility-context"
import { hasAccess } from "@/lib/utils/utils"

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return [hours, minutes, secs].map((value) => value.toString().padStart(2, "0")).join(":")
}

/**
 * Compact responsibility timer for the floating session timer's second tab.
 * Same shared state as /dashboard/laboratorio?tab=responsabilidade (no
 * duplication): assume/release the lab, live duration, paused badge, and a
 * disabled assume button naming the current owner when someone else holds it.
 */
export function ResponsibilityMiniPanel() {
  const { user } = useAuth()
  const {
    activeResponsibility,
    loading,
    error,
    fetchActiveResponsibility,
    startResponsibility,
    endResponsibility,
  } = useResponsibility()
  const canAssume = hasAccess(user?.roles || [], "VIEW_ALL_DATA")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    void fetchActiveResponsibility()
    // Live ownership changes while the tab is open (someone else assumes).
    // Tick is local to the panel; duration itself ticks every 1s in context.
    const interval = setInterval(() => {
      void fetchActiveResponsibility()
    }, 30000)
    return () => clearInterval(interval)
  }, [fetchActiveResponsibility])

  const isOwner = Boolean(activeResponsibility && user && activeResponsibility.userId === user.id)

  const handleStart = async () => {
    setActionError(null)
    setBusy(true)
    try {
      await startResponsibility(notes)
      setNotes("")
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Não foi possível iniciar a responsabilidade. Tente novamente.")
      await fetchActiveResponsibility()
    } finally {
      setBusy(false)
    }
  }

  const handleEnd = async () => {
    setActionError(null)
    setBusy(true)
    try {
      await endResponsibility()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Não foi possível encerrar a responsabilidade. Tente novamente.")
    } finally {
      setBusy(false)
    }
  }

  if (loading && !activeResponsibility) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Responsabilidade</p>
        {!activeResponsibility ? (
          <Badge variant="outline">Laboratório disponível</Badge>
        ) : activeResponsibility.isPaused ? (
          <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
            PAUSADA
          </Badge>
        ) : (
          <Badge variant="default">Em uso</Badge>
        )}
      </div>

      {!activeResponsibility ? (
        canAssume ? (
          <>
            <Textarea
              placeholder="Notas (opcional)"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="resize-none"
              rows={2}
            />
            <Button size="sm" className="w-full" onClick={handleStart} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              Estar responsável
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center">
            Apenas laboratoristas e coordenadores podem assumir responsabilidade pelo laboratório.
          </p>
        )
      ) : (
        <>
          <p className="text-sm">
            {activeResponsibility.userName}
            {isOwner && <span className="ml-1 text-xs text-muted-foreground">(você)</span>}
          </p>
          <p className="font-mono text-2xl font-bold">{formatDuration(activeResponsibility.duration)}</p>
          {isOwner ? (
            <Button size="sm" variant="destructive" className="w-full" onClick={handleEnd} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
              Não sou mais responsável
            </Button>
          ) : (
            <Button size="sm" className="w-full" disabled title="Outro usuário já é o responsável">
              Estar responsável
            </Button>
          )}
        </>
      )}

      {actionError && <p className="text-xs text-red-600 dark:text-red-400">{actionError}</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <Link
        href="/dashboard/laboratorio?tab=responsabilidade"
        className="block text-center text-xs text-muted-foreground underline underline-offset-4"
      >
        Abrir no Laboratório
      </Link>
    </div>
  )
}
