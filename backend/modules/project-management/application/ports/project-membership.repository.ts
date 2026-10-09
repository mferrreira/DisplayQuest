/**
 * ProjectManagementMembershipPort — OND5-B2 (R1). The `project_members` seam of the
 * MANAGEMENT module (creator/leader/volunteer memberships + the canActorManageProject role
 * read + the volunteer-stats join). The membership module has its own port file — each
 * module owns its contract (composition wires real adapters).
 */
import type { Role } from "@/backend/domain"

export interface ProjectMemberWithUser {
  id: number;
  projectId: number;
  userId: number;
  roles: Role[];
  joinedAt: Date;
  user: {
    id: number;
    name: string | null;
    email: string | null;
    avatar: string | null;
    points: number;
    completedTasks: number;
  } | null;
}

export interface ProjectManagementMembershipPort {
  /** null when there is NO membership (the canActorManageProject branch distinction matters). */
  findMembership(projectId: number, userId: number): Promise<{ id: number; roles: Role[] } | null>
  createMembership(input: { projectId: number; userId: number; roles: Role[] }): Promise<void>
  updateMembershipRoles(membershipId: number, roles: Role[]): Promise<void>
  /** joinedAt ASC (frozen from ProjectMembershipRepository.getProjectMembersWithDetails). */
  listMembersWithUser(projectId: number): Promise<ProjectMemberWithUser[]>
}
