/**
 * S06 (plan-v11, R6) — o feed "Atividade recente" fica abaixo do quadro.
 *
 * Por que existe: o pedido do dono é a ordem da Home — gráfico na faixa, feed abaixo do
 * quadro. A ordem é do DOM do TaskBoard (colunas, depois o feed); o aceite congela a
 * posição relativa, não só a existência do feed (que já era provada no arquivo irmão de
 * features). Harness reusado de task-board.test.tsx: MSW + useSession stub + NuqsTestingAdapter.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("feed abaixo do quadro (R6)", () => {
  it("a seção 'Atividade recente' vem depois das colunas do quadro no DOM", async () => {
    renderBoard();
    // O quadro nasce `aria-busy` enquanto o React Query lê o MSW; a coluna aparece quando as
    // tarefas chegam (mesma espera de task-board.test.tsx).
    const heading = await screen.findByRole("heading", { name: "A Fazer" });
    const feed = screen.getByRole("region", { name: "Atividade recente" });
    expect(heading.compareDocumentPosition(feed) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(server).toBeDefined();
  });
});
