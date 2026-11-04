// @vitest-environment node
/**
 * plan-v13 S06 — a ordenação do leaderboard de projetos (regra 6 do MODELO).
 *
 * Congelam: `points` desc, empate por `name` asc, empate por `id` asc. Projeto com `points` 0
 * entra no ranking, depois dos pontuados. A divisão pódio/ranking é posição 1-3 / 4 em diante.
 */
import { describe, expect, it } from "vitest";

import { rankProjects } from "@/features/projects/utils/project-ranking";
import type { Project } from "@/contexts/types";

function project(id: number, name: string, points: number | undefined): Project {
  return { id, name, points, status: "active", createdAt: "2026-01-01", createdBy: 1 };
}

describe("rankProjects", () => {
  it("points desc; empate por name asc; empate final por id asc", () => {
    const ranked = rankProjects([
      project(3, "Beta", 10),
      project(1, "Alpha", 10),
      project(2, "Zeta", 20),
      project(4, "Ômega", 10),
    ]);
    expect(ranked.map((e) => [e.project.id, e.position])).toEqual([[2, 1], [1, 2], [3, 3], [4, 4]]);
  });

  it("zero-pontos entra no ranking, depois dos pontuados; pontos ausentes valem zero", () => {
    const ranked = rankProjects([project(5, "Sem saldo", undefined), project(6, "Com saldo", 5)]);
    expect(ranked.map((e) => e.project.id)).toEqual([6, 5]);
    expect(ranked[1].points).toBe(0);
  });

  it("pódio: campeão = posição 1, runners-up 2 e 3; o ranking abaixo começa no 4º", () => {
    const many = [
      project(1, "A", 30),
      project(2, "B", 20),
      project(3, "C", 10),
      project(4, "D", 5),
    ];
    const ranked = rankProjects(many);
    expect(ranked[0].position).toBe(1);
    expect(ranked[3].position).toBe(4);

    const split = rankProjects(many);
    expect(split.slice(0, 1).map((e) => e.project.id)).toEqual([1]);
    expect(split.slice(1, 3).map((e) => e.project.id)).toEqual([2, 3]);
    expect(split.slice(3).map((e) => e.project.id)).toEqual([4]);
  });

  it("1 projeto = só campeão; 2 = campeão + 2º; 0 = lista vazia", () => {
    expect(rankProjects([project(1, "A", 10)])).toHaveLength(1);
    expect(rankProjects([project(1, "A", 10), project(2, "B", 5)])).toHaveLength(2);
    expect(rankProjects([])).toHaveLength(0);
  });
});
