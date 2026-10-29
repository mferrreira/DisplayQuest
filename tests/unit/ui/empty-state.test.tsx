import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";

/**
 * V6-1 · EmptyState (RF-V6.2).
 * Estado vazio uma so vez, sem artwork decorativo (DEC-109).
 */
describe("EmptyState (V6-1)", () => {
  it("renderiza titulo, descricao e acao", () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Nenhum projeto por aqui"
        description="Crie o primeiro projeto do laboratório."
        action={<button type="button">Novo projeto</button>}
      />,
    );
    expect(screen.getByText("Nenhum projeto por aqui")).toBeInTheDocument();
    expect(screen.getByText("Crie o primeiro projeto do laboratório.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo projeto" })).toBeInTheDocument();
  });

  it("sem descricao nem acao, so o titulo", () => {
    render(<EmptyState title="Nenhuma tarefa por aqui" />);
    expect(screen.getByText("Nenhuma tarefa por aqui")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
