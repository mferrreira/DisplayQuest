/**
 * Dono (2026-10-29): o gráfico "Atividade da semana" entrou embaixo do quadro e o feed
 * "Atividade recente" subiu para a faixa. A ordem é do DOM do TaskBoard: colunas, depois o
 * gráfico. Este arquivo congela a posição relativa do gráfico; a existência do feed na faixa é
 * provada em home-overview.test.tsx. Harness reusado de task-board.test.tsx.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { TaskBoard } from "@/features/tasks/components/task-board";
import { server } from "@/tests/mocks/server";

const mockUser = { id: 2, name: "Coordenador", email: "coordenador@lab.com", roles: ["COORDENADOR"] };

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: () => ({ data: { user: mockUser, expires: "" }, status: "authenticated" }),
  };
});

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <SessionProvider session={null}>
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter>
          <TaskBoard />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </SessionProvider>,
  );
}

describe("gráfico 'Atividade da semana' abaixo do quadro (dono 2026-10-29)", () => {
  it("a seção vem depois das colunas do quadro no DOM", async () => {
    renderBoard();
    const heading = await screen.findByRole("heading", { name: "A Fazer" });
    const chart = screen.getByRole("region", { name: "Atividade da semana" });
    expect(heading.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Tarefas e subtasks concluídas nos últimos 7 dias")).toBeInTheDocument();
    expect(server).toBeDefined();
  });
});
