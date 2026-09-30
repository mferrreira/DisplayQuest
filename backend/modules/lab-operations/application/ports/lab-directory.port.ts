/**
 * OND8-B3 — directory port do lab (R2): leitura mínima de `users` que os use cases
 * precisam (roles/status para as decisões de acesso puras do domínio).
 */
export interface LabUserRef {
  id: number
  status: string
  roles: string[]
}

export interface LabDirectory {
  findUserById(userId: number): Promise<LabUserRef | null>
  findUsersWithRoles(roles: string[]): Promise<LabUserRef[]>
}
