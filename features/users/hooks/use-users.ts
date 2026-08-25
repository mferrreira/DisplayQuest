"use client"

/**
 * Minimal users list hook (E2 seed — user-management surfaces land in E8/E9).
 * Consumed via features/users public API only (constitution A2).
 */
import { useQuery } from "@tanstack/react-query"
import { usersApi } from "@/lib/api/endpoints/users"
import { queryKeys } from "@/lib/query/keys"

export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.list({}),
    queryFn: () => usersApi.list(),
    staleTime: 60_000,
  })
}
