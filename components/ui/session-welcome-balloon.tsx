"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SessionWelcomeBalloonProps {
  /** Whether the user is logged in. */
  isLoggedIn: boolean
  /** True when there is no active/paused work session for the user. */
  hasNoSession: boolean
  /** Callback to open the session panel (start form). */
  onStartSession: () => void
}

const DISMISS_KEY = "session-welcome-balloon-dismissed"

/**
 * Temporary balloon above the floating clock inviting the user to start a
 * work session. Shows only while logged in without an active/paused session
 * and until dismissed (per browser session via sessionStorage).
 */
export function SessionWelcomeBalloon({
  isLoggedIn,
  hasNoSession,
  onStartSession,
}: SessionWelcomeBalloonProps) {
  const [dismissed, setDismissed] = useState(true)

  // Read dismissal after mount to avoid SSR hydration mismatch.
  useEffect(() => {
    setDismissed(
      typeof window !== "undefined" &&
        window.sessionStorage.getItem(DISMISS_KEY) === "1",
    )
  }, [])

  if (!isLoggedIn || !hasNoSession || dismissed) return null

  const handleDismiss = () => {
    window.sessionStorage.setItem(DISMISS_KEY, "1")
    setDismissed(true)
  }

  return (
    <div
      role="status"
      data-testid="session-welcome-balloon"
      className="absolute bottom-full left-0 z-10 mb-3 w-64 rounded-lg border bg-popover p-4 text-popover-foreground shadow-md"
    >
      <button
        type="button"
        aria-label="Dispensar convite"
        onClick={handleDismiss}
        className="absolute right-2 top-2 rounded-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="text-sm font-medium">Bem-vindo(a)! 👋</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Pronto para registrar seu trabalho? Inicie uma sessão de trabalho para acompanhar seu tempo.
      </p>
      <Button size="sm" className="mt-3" onClick={onStartSession}>
        Iniciar sessão
      </Button>
    </div>
  )
}
