/**
 * V5-11 (DEC-63/132) — o componente de andamento do projeto, provado com o relógio
 * congelado (`vi.setSystemTime`): a tela renderiza a regra pura, não aritmética própria.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProjectTimeProgress } from "@/components/features/project-time-progress";

beforeEach(() => {
  // "Hoje" do laboratório: 14/10/2026 (meio-dia, longe da borda do dia civil).
  vi.setSystemTime(new Date("2026-10-14T12:00:00-03:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ProjectTimeProgress (V5-11)", () => {
  it("em execução: barra com o percentual do período e os dias que faltam", () => {
    render(<ProjectTimeProgress startDate="2026-02-01" endDate="2026-10-31" />);

    // O `Progress` da casa expressa o valor no transform do indicador (sem aria-valuenow).
    expect(screen.getByRole("progressbar").querySelector("div")).toHaveStyle({
      transform: "translateX(-6%)",
    });
    expect(screen.getByText("Faltam 17 dias para o término — 255 de 272 dias decorridos")).toBeInTheDocument();
  });

  it("sem data de término: o componente não renderiza nada", () => {
    const { container } = render(<ProjectTimeProgress startDate="2026-02-01" endDate={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("encerrado: 100% e os dias desde o término", () => {
    render(<ProjectTimeProgress startDate="2026-02-01" endDate="2026-09-30" />);

    expect(screen.getByRole("progressbar").querySelector("div")).toHaveStyle({
      transform: "translateX(-0%)",
    });
    expect(screen.getByText("Encerrado há 14 dias")).toBeInTheDocument();
  });

  it("antes do início: 0% e os dias até o início", () => {
    render(<ProjectTimeProgress startDate="2026-11-01" endDate="2026-12-31" />);

    expect(screen.getByRole("progressbar").querySelector("div")).toHaveStyle({
      transform: "translateX(-100%)",
    });
    expect(screen.getByText("Começa em 18 dias — término em 78 dias")).toBeInTheDocument();
  });

  it("um dia é 'dia', não 'dias' — a linha acompanha o número", () => {
    render(<ProjectTimeProgress startDate="2026-02-01" endDate="2026-10-15" />);
    expect(screen.getByText(/Faltam 1 dia para o término/)).toBeInTheDocument();
  });
});
