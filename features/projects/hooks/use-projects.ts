"use client"

/**
 * Minimal projects list hook (E2 seed — full feature lands in E4).
 * Consumed via features/projects public API only (constitution A2).
 */
import { useQuery } from "@tanstack/react-query"
import { projectsApi } from "@/lib/api/endpoints/projects"
import { queryKeys } from "@/lib/query/keys"

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects.list({}),
    queryFn: () => projectsApi.list(),
    staleTime: 60_000,
  })
}
