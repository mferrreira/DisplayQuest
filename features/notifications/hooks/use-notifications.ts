"use client"

/**
 * Notifications hooks (E1/T1.4b) — the ONLY sanctioned data path for notifications.
 * Server state via TanStack Query over the typed endpoints (real wire shapes, see endpoint file).
 *
 * Polling: refetchInterval 60s + refetchOnWindowFocus per EXECUTION-PLAN defaults (no websockets
 * this phase). Mutations patch the list cache optimistically; unreadCount invalidates.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { notificationsApi } from "@/lib/api/endpoints/notifications"
import { queryKeys } from "@/lib/query/keys"
import type { Notification } from "@/entities/notification"

const REFETCH_INTERVAL_MS = 60_000

export function useNotifications() {
  const queryClient = useQueryClient()
  const { data: session, status: sessionStatus } = useSession()
  const userId = (session?.user as { id?: number } | undefined)?.id
  const authenticated = sessionStatus === "authenticated" && typeof userId === "number"

  const listQuery = useQuery({
    queryKey: queryKeys.notifications.list({}),
    queryFn: () => notificationsApi.list({}),
    enabled: authenticated,
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 30_000,
  })

  const unreadQuery = useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: () => notificationsApi.unreadCount(),
    enabled: authenticated,
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 30_000,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
  }

  const patchList = (updater: (prev: Notification[]) => Notification[]) => {
    queryClient.setQueryData<Notification[]>(queryKeys.notifications.list({}), (prev) =>
      prev ? updater(prev) : prev,
    )
  }

  const markAsRead = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onMutate: async (id) => {
      patchList((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, read: true, readAt: n.readAt ?? new Date().toISOString() } : n,
        ),
      )
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() })
    },
    onError: () => {
      invalidate()
    },
  })

  const markAllAsRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onMutate: () => {
      patchList((prev) =>
        prev.map((n) => ({ ...n, read: true, readAt: n.readAt ?? new Date().toISOString() })),
      )
      queryClient.setQueryData(queryKeys.notifications.unreadCount(), 0)
    },
    onError: () => {
      invalidate()
    },
  })

  const deleteNotification = useMutation({
    mutationFn: (id: number) => notificationsApi.remove(id),
    onMutate: async (id) => {
      patchList((prev) => prev.filter((n) => n.id !== id))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount() })
    },
    onError: () => {
      invalidate()
    },
  })

  return {
    notifications: listQuery.data ?? [],
    unreadCount: unreadQuery.data ?? 0,
    loading:
      sessionStatus !== "authenticated" ||
      listQuery.isPending ||
      (listQuery.isSuccess && unreadQuery.isPending),
    error: listQuery.error
      ? "Erro ao carregar notificações"
      : unreadQuery.error
        ? "Erro ao carregar contagem de notificações"
        : null,
    markAsRead: (id: number) => markAsRead.mutateAsync(id).catch(() => undefined),
    markAllAsRead: () => markAllAsRead.mutateAsync().catch(() => undefined),
    deleteNotification: (id: number) => deleteNotification.mutateAsync(id).catch(() => undefined),
  }
}
