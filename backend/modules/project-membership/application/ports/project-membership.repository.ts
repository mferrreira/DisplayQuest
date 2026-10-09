/**
 * ProjectMembershipRepositoryPort — OND5-B2 (R1). The `project_members` seam of the
 * membership module. `listMembersWithUser` keeps the gateway's joinedAt DESC ordering;
 * user name/email are joined by the adapter (the views expose them as `string | null`).
 */
import type { Role } from "@/backend/domain"

export interface MembershipSummary {
  id: number
  roles: Role[]
}

export interface MembershipRecord {
  id: number
  projectId: number
  userId: number
  roles: Role[]
  joinedAt: Date
  userName: string | null
  userEmail: string | null
}

export interface MembershipDetailRecord {
  id: number
  userId: number
  roles: Role[]
  userName: string | null
}

export interface ProjectMembershipRepositoryPort {
  /** joinedAt DESC (frozen from the gateway's listProjectMembers). */
  listMembersWithUser(projectId: number): Promise<MembershipRecord[]>
  findMembership(projectId: number, userId: number): Promise<MembershipSummary | null>
  findMembershipById(membershipId: number, projectId: number): Promise<MembershipDetailRecord | null>
  countMembersWithRole(projectId: number, role: Role): Promise<number>
  createMembership(input: { projectId: number; userId: number; roles: Role[] }): Promise<MembershipRecord>
  updateMembershipRoles(membershipId: number, roles: Role[]): Promise<MembershipRecord>
  deleteMembership(membershipId: number): Promise<void>
}
