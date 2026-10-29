import type { Project } from "@/contexts/types"

/**
 * R11 (S11): primeira carga do quadro sem `?projeto=`. Se o usuário lidera um projeto, abre
 * nele; senão, no primeiro projeto em que é membro; senão, "Todos os projetos" (null).
 *
 * Liderança vem de `leaderId`; a filiação vem de `isMember` (projeção da lista pelo ator). A
 * ordem de preferência segue o critério do plano. Nenhum dado é escrito: só escolhemos o
 * projeto inicial.
 */
export function pickDefaultProject(
  projects: Array<Pick<Project, "id" | "leaderId" | "isMember">>,
  userId: number | null | undefined,
): number | null {
  if (userId == null) return null
  const led = projects.find((p) => p.leaderId === userId)
  if (led) return led.id
  const member = projects.find((p) => p.isMember)
  return member ? member.id : null
}
