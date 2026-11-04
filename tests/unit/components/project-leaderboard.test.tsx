// @vitest-environment jsdom
/**
 * plan-v13 S06 — o leaderboard de projetos da aba Dashboard (regra 6 do MODELO).
 *
 * Congelam:
 *   - pódio top 3: campeão com rótulo "Campeão" e pontos em corpo grande; 2º e 3º em cartões
 *     com medalha; 1 projeto = só campeão, 2 = campeão + 2º;
 *   - abaixo do pódio, o ranking completo do recorte começa no 4º com posição, nome, subtítulo,
 *     status e pontos (o mesmo padrão medido da liderança de pessoas, V6-11m);
 *   - pódio e linhas abrem o detalhe do projeto;
 *   - recorte vazio: estado vazio.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ProjectLeaderboard } from "@/components/features/project-leaderboard";
import type { Project } from "@/contexts/types";

vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: null }) }));

function project(id: number, name: string, points: number, subtitle: string | null = null): Project {
  return { id, name, subtitle, description: null, createdAt: "2026-01-01", createdBy: 1, status: "active", points, logoKey: null, bannerKey: null };
}

const P1 = project(1, "Pesquisa em IA", 30, "Bolsa de pesquisa");
const P2 = project(2, "Automação", 20);
const P3 = project(3, "Microscopia", 10);
const P4 = project(4, "Sem saldo", 0, "Iniciação junior");

describe("ProjectLeaderboard", () => {
  it("campeão com rótulo e pontos em corpo grande; 2º e 3º em cartões", () => {
    const opened: number[] = [];
    render(<ProjectLeaderboard projects={[P3, P2, P1, P4]} onProjectSelect={(p) => opened.push(p.id)} />);

    const championSection = screen.getByRole("region", { name: /Campeão/ });
    expect(championSection).toHaveTextContent("Campeão");
    expect(championSection).toHaveTextContent("Pesquisa em IA");
    expect(championSection).toHaveTextContent("30");

    const runnersUp = screen.getByRole("region", { name: /Segundo e terceiro/ });
    expect(runnersUp).toHaveTextContent("Automação");
    expect(runnersUp).toHaveTextContent("Microscopia");
    expect(runnersUp).not.toHaveTextContent("Sem saldo");

    fireEvent.click(championSection.querySelector("a")!);
    expect(opened).toEqual([1]);
    fireEvent.click(runnersUp.querySelectorAll("a")[1]);
    expect(opened).toEqual([1, 3]);
  });

  it("o ranking abaixo do pódio começa no 4º, com posição, subtítulo, status e pontos", () => {
    render(<ProjectLeaderboard projects={[P1, P2, P3, P4]} onProjectSelect={() => {}} />);

    const rowsSection = screen.getByRole("region", { name: /Classificação/ });
    expect(rowsSection.textContent).toContain("4º");
    expect(rowsSection.textContent).toContain("Sem saldo");
    expect(rowsSection.textContent).toContain("Iniciação junior");
    expect(rowsSection.textContent).toContain("Ativo");
    expect(rowsSection.textContent).toContain("0");
    expect(rowsSection.textContent).not.toContain("Pesquisa em IA");

    const row = rowsSection.querySelectorAll("a")[0];
    expect(row.getAttribute("aria-label")).toBe("Ver detalhes de Sem saldo");
  });

  it("1 projeto = só campeão, sem seção de segundo e terceiro; 2 = campeão + 2º", () => {
    render(<ProjectLeaderboard projects={[P1]} onProjectSelect={() => {}} />);
    expect(screen.getByRole("region", { name: /Campeão/ })).toHaveTextContent("Pesquisa em IA");
    expect(screen.queryByRole("region", { name: /Segundo e terceiro/ })).not.toBeInTheDocument();

    render(<ProjectLeaderboard projects={[P1, P2]} onProjectSelect={() => {}} />);
    const runnersUp = screen.getByRole("region", { name: /Segundo e terceiro/ });
    expect(runnersUp).toHaveTextContent("Automação");
    expect(runnersUp.querySelectorAll("a")).toHaveLength(1);
  });

  it("recorte vazio: estado vazio, nenhum pódio", () => {
    render(<ProjectLeaderboard projects={[]} onProjectSelect={() => {}} />);
    expect(screen.queryByRole("region", { name: /Campeão/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Nenhum projeto/)).toBeInTheDocument();
  });
});
