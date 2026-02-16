import type {
  AddProjectMemberCommand,
  CreatedProjectMemberView,
  ProjectLeaderView,
  ListProjectMembersQuery,
  ProjectMemberView,
  RemoveProjectMemberCommand,
  UpsertProjectMemberRolesCommand,
  AssignProjectLeaderCommand,
} from "@/backend/modules/project-membership/application/contracts"

export interface ProjectMembershipGateway {
  listProjectMembers(query: ListProjectMembersQuery): Promise<ProjectMemberView[]>
  addProjectMember(command: AddProjectMemberCommand): Promise<CreatedProjectMemberView>
  removeProjectMember(command: RemoveProjectMemberCommand): Promise<{ memberName: string | null }>
  upsertProjectMemberRoles(command: UpsertProjectMemberRolesCommand): Promise<CreatedProjectMemberView>
  assignProjectLeader(command: AssignProjectLeaderCommand): Promise<ProjectLeaderView>
}
