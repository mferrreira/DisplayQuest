/**
 * ProfileVisibilityPort — leitura do vínculo em comum para a regra de visibilidade de perfil
 * (V5-12, DEC-143/177).
 *
 * A regra pura (`canActorViewProfile`) não consulta nada: quem sabe se duas pessoas
 * participam do mesmo projeto é quem lê `project_members`. O adaptador é Prisma próprio do
 * módulo (RG-04: o módulo não importa repositório de outro módulo — mesmo desenho medido do
 * `ProjectHoursPort` e do scan de atraso).
 */
export interface ProfileVisibilityPort {
  /** Ids das pessoas que compartilham pelo menos um projeto com `actorId` (sem o próprio). */
  findSharedProjectUserIds(actorId: number): Promise<number[]>;
}
