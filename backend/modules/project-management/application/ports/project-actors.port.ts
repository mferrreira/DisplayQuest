/**
 * ProjectActorsPort — OND5-B2 (R1). V5-2a (DEC-127) encolhe a porta: a leitura de projeto passou
 * a ser decidida por `domain/project/canActorAccessProjectDecision` sem consultar tabela, então
 * `membershipExists` e `findProjectRelation` saíram (eram as duas leituras da regra antiga).
 * Sobrou o `findActor`, que a decisão de GESTÃO precisa para o ator sem membership.
 */
export interface ProjectActorRecord {
  id: number
  roles: string[]
}

export interface ProjectActorsPort {
  findActor(userId: number): Promise<ProjectActorRecord | null>
}
