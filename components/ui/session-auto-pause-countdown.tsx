"use client"

import { useEffect, useMemo, useState } from "react"
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
 *
 * The pause boundary is a fixed instant for the lifetime of the current
 * (status, startTime) pair, so it is derived once via the schedule helpers
 * and each 1s tick only does plain arithmetic against that instant — no
 * timezone schedule math per tick.
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

  const boundary = useMemo(() => {
    if (sessionStatus !== "active" || !startTime) return null
    const at = new Date()
    const missed = getMissedScheduledPause(startTime, at)
    return {
      missed,
      next: missed ? null : getNextScheduledPause(at),
    }
  }, [sessionStatus, startTime])

  if (sessionStatus !== "active" || !startTime || !boundary) return null

  const boundaryPassed =
    boundary.missed !== null ||
    (boundary.next !== null && boundary.next.getTime() <= now.getTime())

  if (boundaryPassed) {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        Sessão será pausada automaticamente
      </p>
    )
  }

  const minutes = Math.max(0, Math.ceil((boundary.next!.getTime() - now.getTime()) / 60_000))

  return (
    <p className="text-xs text-muted-foreground">
      Pausa automática em {formatCountdown(minutes)}
    </p>
  )
}
