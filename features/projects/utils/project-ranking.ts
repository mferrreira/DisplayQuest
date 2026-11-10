import type { Project } from "@/contexts/types";

/**
 * plan-v13 S06 (regra 6 do MODELO) — a ordenação do leaderboard de projetos.
 *
 * Regra congelada: `points` desc, empate por `name` asc, empate final por `id` asc. Projeto com
 * `points` 0 (ou ausente) entra no ranking, depois dos pontuados. A função devolve a lista
 * ordenada com posição; a divisão pódio (1-3) / ranking abaixo (4 em diante) é `.slice` na tela,
 * e o teste congela as posições — não uma segunda regra de corte.
 */
export interface RankedProject {
  project: Project;
  points: number;
  position: number;
}

export function rankProjects(projects: readonly Project[]): RankedProject[] {
  return projects
    .map((project) => ({ project, points: project.points ?? 0 }))
    .sort((a, b) => b.points - a.points || a.project.name.localeCompare(b.project.name) || a.project.id - b.project.id)
    .map((entry, i) => ({ ...entry, position: i + 1 }));
}
