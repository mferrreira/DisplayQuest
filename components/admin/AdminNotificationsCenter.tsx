"use client"

import { useMemo, useState } from "react"
import { Bell, Send, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

type RecipientMode = "all" | "specific"

type UserItem = {
  id: number
  name: string
  email: string
  status?: string
}

interface AdminNotificationsCenterProps {
  users: UserItem[]
}

export function AdminNotificationsCenter({ users }: AdminNotificationsCenterProps) {
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [mode, setMode] = useState<RecipientMode>("all")
  const [selectedUserId, setSelectedUserId] = useState<string>("")
  const [recipientIds, setRecipientIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeUsers = useMemo(
    () => users.filter((user) => user.status === "active"),
    [users],
  )

  const selectedRecipients = useMemo(
    () => recipientIds
      .map((id) => activeUsers.find((user) => user.id === id))
      .filter((user): user is UserItem => Boolean(user)),
    [recipientIds, activeUsers],
  )

  const addRecipient = (value: string) => {
    setSelectedUserId(value)
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) return
    setRecipientIds((prev) => (prev.includes(parsed) ? prev : [...prev, parsed]))
  }

  const removeRecipient = (id: number) => {
    setRecipientIds((prev) => prev.filter((currentId) => currentId !== id))
  }

  const resetForm = () => {
    setTitle("")
    setMessage("")
    setSelectedUserId("")
    setRecipientIds([])
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setFeedback(null)

    if (!title.trim() || !message.trim()) {
      setError("Título e descrição são obrigatórios")
      return
    }

    if (mode === "specific" && recipientIds.length === 0) {
      setError("Selecione ao menos um usuário")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "SYSTEM_ANNOUNCEMENT",
          title: title.trim(),
          message: message.trim(),
          sendToAll: mode === "all",
          userIds: mode === "specific" ? recipientIds : undefined,
          data: {
            source: "admin-panel",
          },
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Erro ao enviar notificação")
      }

      const createdCount = typeof payload?.createdCount === "number" ? payload.createdCount : 0
      setFeedback(`Notificação enviada com sucesso para ${createdCount} usuário(s).`)
      resetForm()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Erro ao enviar notificação")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Emissão de Notificações
          </CardTitle>
          <CardDescription>
            Envie avisos para todos os usuários ativos ou para destinatários específicos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="notification-title">Título</Label>
              <Input
                id="notification-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Atualização de rotina do laboratório"
                maxLength={120}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notification-message">Descrição</Label>
              <Textarea
                id="notification-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Descreva a mensagem que os usuários devem receber"
                className="min-h-[120px]"
                maxLength={1000}
              />
            </div>

            <div className="space-y-2">
              <Label>Destinatários</Label>
              <Select value={mode} onValueChange={(value: RecipientMode) => setMode(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo de envio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários ativos</SelectItem>
                  <SelectItem value="specific">Usuários específicos</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {mode === "specific" && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-2">
                  <Label>Adicionar usuário</Label>
                  <Select value={selectedUserId} onValueChange={addRecipient}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedRecipients.length === 0 && (
                    <span className="text-sm text-muted-foreground">Nenhum destinatário selecionado.</span>
                  )}
                  {selectedRecipients.map((user) => (
                    <Badge key={user.id} variant="secondary" className="flex items-center gap-2 py-1">
                      <span>{user.name}</span>
                      <button
                        type="button"
                        onClick={() => removeRecipient(user.id)}
                        className="rounded-sm p-0.5 hover:bg-black/10"
                        aria-label={`Remover ${user.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="text-sm text-red-600">{error}</div>}
            {feedback && <div className="text-sm text-green-700">{feedback}</div>}

            <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
              <Send className="mr-2 h-4 w-4" />
              {submitting ? "Enviando..." : "Enviar notificação"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
