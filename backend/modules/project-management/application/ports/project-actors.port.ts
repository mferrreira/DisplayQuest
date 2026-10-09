/**
 * ProjectActorsPort — OND5-B2 (R1). Actor roles + the two reads the access decision needs
 * (membership existence, project leader/creator relation). These used to be raw `prisma`
 * calls inside ProjectServiceGateway.canActorAccessProject (rg06 debt inside the module);
 * the decision itself moved to domain/project/canActorAccessProjectDecision.
 */
export interface ProjectActorRecord {
  id: number
  roles: string[]
}

export interface ProjectActorsPort {
  findActor(userId: number): Promise<ProjectActorRecord | null>
  membershipExists(projectId: number, userId: number): Promise<boolean>
  findProjectRelation(projectId: number): Promise<{ leaderId: number | null; createdBy: number } | null>
}
