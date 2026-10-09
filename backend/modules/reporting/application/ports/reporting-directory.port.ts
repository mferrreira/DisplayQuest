/**
 * OND7-B3 — read-only directory port over `users` + `projects` + `project_members`.
 * The reporting module never writes users except `currentWeekHours` (resetWeeklyHoursHistory
 * legacy behavior, frozen).
 */
export interface ReportingDirectory {
  findUserById(id: number): Promise<{ id: number; name: string } | null>
  findActiveUsers(): Promise<Array<{ id: number; name: string }>>
  /** ACTIVE users holding COORDENADOR or GERENTE, excluding `excludeUserId` (frozen roles). */
  findReportManagers(excludeUserId: number): Promise<Array<{ id: number }>>
  resetCurrentWeekHours(userId: number): Promise<void>

  projectExists(projectId: number): Promise<boolean>
  getProjectName(projectId: number): Promise<string | null>
  isProjectLeader(projectId: number, userId: number): Promise<boolean>
  findLedProjectIds(userId: number): Promise<number[]>
  findMemberships(userId: number): Promise<Array<{ project: { id: number; name: string; status: string } | null }>>
  findAllProjectsWithMembers(): Promise<
    Array<{
      id: number
      name: string
      status: string
      members: Array<{ userId: number; user: { name: string } | null; roles: string[] }>
    }>
  >
}
