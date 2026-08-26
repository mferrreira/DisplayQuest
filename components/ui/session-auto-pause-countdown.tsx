"use client"

import { useEffect, useState } from "react"
import {
  getMissedScheduledPause,
  getNextScheduledPause,
} from "@/lib/work-sessions/schedule"

interface SessionAutoPauseCountdownProps {
  sessionStatus: string | null
  startTime: Date | string | null
}

function formatCountdown(totalMinutes: number) {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${h}h ${m}min`
}

/**
 * Countdown to the next scheduled auto-pause (09:30/12:00/15:00/17:00 SP),
 * shown inside the expanded session clock while a session is active.
 */
export function SessionAutoPauseCountdown({
  sessionStatus,
  startTime,
}: SessionAutoPauseCountdownProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (sessionStatus !== "active") return
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [sessionStatus])

  if (sessionStatus !== "active" || !startTime) return null

  if (getMissedScheduledPause(startTime, now)) {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        Sessão será pausada automaticamente
      </p>
    )
  }

  const minutes = Math.max(
    0,
    Math.ceil((getNextScheduledPause(now).getTime() - now.getTime()) / 60_000),
  )

  return (
    <p className="text-xs text-muted-foreground">
      Pausa automática em {formatCountdown(minutes)}
    </p>
  )
}
