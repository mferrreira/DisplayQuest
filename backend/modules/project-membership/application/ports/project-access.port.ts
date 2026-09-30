/**
 * ProjectAccessPort — OND5-B2 (R1). Project/user existence + the leader write side of the
 * membership module (assignProjectLeader). `leadsAnotherProject` is the frozen single-leader
 * rule: a user may lead at most one project at a time.
 */
export interface ProjectAccessPort {
  projectExists(projectId: number): Promise<boolean>
  userExists(userId: number): Promise<boolean>
  leadsAnotherProject(targetUserId: number, projectId: number): Promise<boolean>
  setProjectLeader(projectId: number, leaderId: number | null): Promise<{ projectId: number; leaderId: number | null }>
}
