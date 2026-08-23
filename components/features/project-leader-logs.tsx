"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ClipboardList, Loader2, Timer } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"

interface ProjectLeaderLogsProps {
  projectId: number
}

interface DailyLogItem {
  id: number
  userId: number
  note: string | null
  date: string | string[] | null
  createdAt?: string
  userName?: string
  user?: { name?: string; email?: string }
}

interface WorkSessionItem {
  id: number
  userId: number
  userName?: string
  activity: string | null
  location: string | null
  startTime: string | string[]
  endTime: string | string[] | null
  duration: number | null
}

function formatDateTime(value: string | string[] | null | undefined): string {
  if (!value) return "-"
  const raw = Array.isArray(value) ? value[0] : value
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

function formatDuration(seconds: number | null): string {
  if (!seconds && seconds !== 0) return "-"
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`
}

export function ProjectLeaderLogs({ projectId }: ProjectLeaderLogsProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [denied, setDenied] = useState(false)
  const [logs, setLogs] = useState<DailyLogItem[]>([])
  const [sessions, setSessions] = useState<WorkSessionItem[]>([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setDenied(false)
      try {
        const [logsRes, sessionsRes] = await Promise.all([
          fetch(`/api/daily_logs?projectId=${projectId}`, { cache: "no-store" }),
          fetch(`/api/work-sessions?projectId=${projectId}`, { cache: "no-store" }),
        ])

        if (!cancelled) {
          if (!logsRes.ok || !sessionsRes.ok) {
            setDenied(!logsRes.ok || !sessionsRes.ok)
            setLogs([])
            setSessions([])
          } else {
            const logsData = await logsRes.json()
            const sessionsData = await sessionsRes.json()
            setLogs(Array.isArray(logsData?.logs) ? logsData.logs : [])
            setSessions(Array.isArray(sessionsData?.data) ? sessionsData.data : [])
          }
        }
      } catch {
        if (!cancelled) {
          setDenied(true)
          setLogs([])
          setSessions([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (!user || loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (denied) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5" />
          Logs do Projeto
        </CardTitle>
        <CardDescription>
          Visão completa de logs e sessões dos membros deste projeto (acesso de líder)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 text-sm font-medium">Notas diárias</div>
          {logs.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum log registrado.</div>
          ) : (
            <ScrollArea className="max-h-56 rounded-md border p-3">
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{log.user?.name ?? log.userName ?? `Usuário ${log.userId}`}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(log.date)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap">{log.note ?? "-"}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Timer className="h-4 w-4" />
            Sessões de trabalho
          </div>
          {sessions.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma sessão registrada.</div>
          ) : (
            <ScrollArea className="max-h-56 rounded-md border p-3">
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div key={session.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {session.userName || `Usuário ${session.userId}`}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(session.startTime)} → {formatDateTime(session.endTime)}
                      </span>
                      <span className="text-xs font-medium">{formatDuration(session.duration)}</span>
                    </div>
                    {session.activity && (
                      <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{session.activity}</p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
