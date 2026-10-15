import { StrictMode } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FolderKanban } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";

/**
 * V6-1 · PageHeader (RF-V6.2, AC-V6-04/36).
 * Um `<h1>` so, descricao quieta, acoes do lado, e o titulo do navegador escrito por
 * efeito no cliente (DEC-188). O caso em StrictMode existe porque o jsdom desta base NAO
 * liga o modo estrito e o `next dev` liga (gotcha medido no plan-v4): um efeito que roda
 * duas vezes nao pode depender de estado que ele mesmo consome.
 */
describe("PageHeader (V6-1)", () => {
  afterEach(() => {
    document.title = "";
  });

  it("renderiza exatamente um h1 com o titulo e a descricao quieta", () => {
    render(<PageHeader title="Projetos" description="Acompanhe o andamento dos projetos" icon={FolderKanban} />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Projetos");
    expect(screen.getByText("Acompanhe o andamento dos projetos")).toBeInTheDocument();
  });

  it("renderiza as acoes contextuais", () => {
    render(<PageHeader title="Projetos" actions={<button type="button">Novo projeto</button>} />);
    expect(screen.getByRole("button", { name: "Novo projeto" })).toBeInTheDocument();
  });

  it("escreve o titulo do navegador no formato '<titulo> · DisplayQuest' (DEC-188)", () => {
    render(<PageHeader title="Projetos" />);
    expect(document.title).toBe("Projetos · DisplayQuest");
  });

  it("atualiza o titulo quando a prop muda", () => {
    const { rerender } = render(<PageHeader title="Projetos" />);
    rerender(<PageHeader title="Relatórios" />);
    expect(document.title).toBe("Relatórios · DisplayQuest");
  });

  it("o titulo vale tambem sob StrictMode (efeito idempotente)", () => {
    render(
      <StrictMode>
        <PageHeader title="Laboratório" />
      </StrictMode>,
    );
    expect(document.title).toBe("Laboratório · DisplayQuest");
  });
});
