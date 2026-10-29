import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarChart3 } from "lucide-react";

import { StatCard } from "@/components/ui/stat-card";

/**
 * V6-1 · StatCard (RF-V6.2, AC-V6-05).
 * O padrao de bloco de resumo (label + valor + dica + icone) passa a existir uma vez.
 */
describe("StatCard (V6-1)", () => {
  it("renderiza label, valor e dica", () => {
    render(<StatCard label="Total de Projetos" value={12} hint="9 ativos, 2 concluídos" />);
    expect(screen.getByText("Total de Projetos")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("9 ativos, 2 concluídos")).toBeInTheDocument();
  });

  it("renderiza o icone", () => {
    const { container } = render(<StatCard label="Projetos Ativos" value={9} icon={BarChart3} />);
    // o svg do lucide nao tem nome acessivel — e decorativo por construcao
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("class")).toContain("h-4");
  });

  it("sem dica, so label e valor", () => {
    render(<StatCard label="Taxa de Conclusão" value="76%" />);
    expect(screen.getByText("Taxa de Conclusão")).toBeInTheDocument();
    expect(screen.getByText("76%")).toBeInTheDocument();
  });
});
