"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { useAuth } from "@/contexts/auth-context"

export interface Notification {
  id: number
  userId: number
  type: string
  title: string
  message: string
  data?: any
  read: boolean
  createdAt: string
  readAt?: string | null
}

interface NotificationContextType {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  error: string | null
  fetchNotifications: () => Promise<void>
  markAsRead: (id: number) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (id: number) => Promise<void>
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function useNotification(): NotificationContextType {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const fetchNotifications = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      setError(null)

      const response = await fetch("/api/notifications")
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Erro ao buscar notificações")
      }

      setNotifications(data.notifications || [])
    } catch (err) {
      setError("Erro ao carregar notificações")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [user])

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return

    try {
      const response = await fetch("/api/notifications?count=true")
      const data = await response.json()

      if (response.ok) {
        setUnreadCount(data.count || 0)
      }
    } catch (err) {
      console.error("Erro ao buscar contagem de notificações:", err)
    }
  }, [user])

  const markAsRead = useCallback(async (id: number) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "markAsRead" }),
      })

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((notification) =>
            notification.id === id ? { ...notification, read: true, readAt: new Date().toISOString() } : notification,
          ),
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (err) {
      console.error("Erro ao marcar notificação como lida:", err)
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "POST",
      })

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((notification) => ({
            ...notification,
            read: true,
            readAt: new Date().toISOString(),
          })),
        )
        setUnreadCount(0)
      }
    } catch (err) {
      console.error("Erro ao marcar todas as notificações como lidas:", err)
    }
  }, [])

  const deleteNotification = useCallback(async (id: number) => {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setNotifications((prev) => prev.filter((notification) => notification.id !== id))
        setUnreadCount((prev) => Math.max(0, prev - 1))
      }
    } catch (err) {
      console.error("Erro ao excluir notificação:", err)
    }
  }, [])

  useEffect(() => {
    if (user) {
      fetchNotifications()
      fetchUnreadCount()
    } else {
      setNotifications([])
      setUnreadCount(0)
    }
  }, [user, fetchNotifications, fetchUnreadCount])

  return {
    notifications,
    unreadCount,
    loading,
    error,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  }
}

