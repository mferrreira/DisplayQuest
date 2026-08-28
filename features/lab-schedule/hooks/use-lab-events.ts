"use client"

/**
 * Lab events hooks (Agenda do Dia) — server state via TanStack Query over
 * `labEventsApi`. Legacy `contexts/lab-events-context.tsx` was replaced by this
 * module (2026-08-27): `useLabEventsForDay` for the selected day, `useUpcomingLabEvents`
 * for the "Próximos eventos" dialog, and `useLabEventMutations` for create/update/delete.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { labEventsApi } from "@/lib/api/endpoints/lab-events"
import { queryKeys } from "@/lib/query/keys"

export const UPCOMING_DAYS = 14

/**
 * Events of one day. Passed a `Date`, the key is its UTC calendar day — stable
 * enough for cache identity because the same date always maps to the same slate.
 */
export function useLabEventsForDay(date: Date | undefined) {
  const dateKey = date ? date.toISOString().slice(0, 10) : undefined
  return useQuery({
    queryKey: queryKeys.lab.events.list(dateKey),
    queryFn: () => {
      if (!date) return []
      return labEventsApi.listByDate(date.getDate(), date.getMonth() + 1, date.getFullYear())
    },
    enabled: Boolean(date),
    staleTime: 30_000,
  })
}

/**
 * "Próximos eventos" window (today..today+days-1). `enabled` lazily gates the
 * fetch: the dialog calls it with `open` so the request only fires on the
 * first open (cached 60s afterwards).
 */
export function useUpcomingLabEvents(days = UPCOMING_DAYS, enabled = true) {
  return useQuery({
    queryKey: queryKeys.lab.events.upcoming(days),
    queryFn: () => labEventsApi.upcoming(days),
    enabled,
    staleTime: 60_000,
  })
}

/**
 * Cross-cutting invalidation for ANY lab-event mutation (§5.3): the day list and
 * the upcoming window both derive from the same `lab.events` root key.
 */
export function useLabEventMutations() {
  const queryClient = useQueryClient()
  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.lab.events.all })
  }

  const create = useMutation({
    mutationFn: (body: { date: string; note: string }) => labEventsApi.create(body),
    onSettled: invalidateAll,
  })

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: { date?: string; note?: string } }) =>
      labEventsApi.update(id, body),
    onSettled: invalidateAll,
  })

  const remove = useMutation({
    mutationFn: (id: number) => labEventsApi.remove(id),
    onSettled: invalidateAll,
  })

  return { create, update, remove }
}