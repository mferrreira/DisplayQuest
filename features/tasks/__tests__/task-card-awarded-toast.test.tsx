/**
 * plan-v4 · V4-5c — GAP-P3-05 fechado: o toast da conclusão anuncia o número CREDITADO, não o
 * projetado.
 *
 * O gap vinha registrado desde o plan-v3 (§8): `task-card.tsx` calculava `projectedAward(task)` e
 * mostrava esse número ANTES de a mutação acontecer. O servidor pode creditar outro valor — e é o
 * que ele faz quando a tarefa está vencida: o número projetado no cliente e o creditado na resposta
 * são coisas diferentes, e a pessoa só tem direito ao segundo.
 *
 * O mock de teste ajuda a provar a direção: ele credita **10** na conclusão direta
 * (`tests/mocks/handlers.ts:179`), enquanto a tarefa deste teste está vencida há 3 dias e projeta
 * **−20**. Se o toast mostrar 10, ele leu a resposta. Se mostrar −20, leu a projeção.
 *
 * A frase é uma função pura (`completionAwardMessage`) porque os dois chamadores — o menu do cartão
 * e o soltar do arrasto no quadro — anunciam a mesma conclusão, e a lição medida do plan-v3 é que
 * a mesma regra em duas cópias diverge.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { Toaster } from "@/components/ui/sonner";
import { TaskBoard } from "../components/task-board";
import { completionAwardMessage } from "../utils/move-rules";
import { resetTaskStore, seedTasks } from "@/tests/mocks/handlers";
import { makeTask } from "@/tests/mocks/fixtures/tasks";

const mockUser = { id: 2, name: "Coordenador", email: "coordenador@lab.com", roles: ["COORDENADOR"] };

vi.mock("next-auth/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-auth/react")>();
  return {
    ...actual,
    useSession: () => ({ data: { user: mockUser, expires: "" }, status: "authenticated" }),
  };
});

function installMatchMediaStub() {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("V4-5c · a frase do prêmio creditado (GAP-P3-05)", () => {
  it("crédito nulo não inventa número: é 'após aprovação'", () => {
    expect(completionAwardMessage({ awardedTo: null, awardedPoints: null })).toBe(
      "Os pontos serão adicionados após aprovação.",
    );
  });

  it("crédito na própria pessoa diz 'a você'", () => {
    expect(completionAwardMessage({ awardedTo: 7, awardedPoints: 25 }, 7)).toBe("25 pts creditados a você.");
  });

  it("crédito em outra pessoa não mente sobre quem recebeu", () => {
    // O sinal é o do número, sem tipografia inventada: `-30` é como o resto da base imprime
    // negativo (o chip de pontos em `lib/points-delta.ts` faz o mesmo).
    expect(completionAwardMessage({ awardedTo: 9, awardedPoints: -30 }, 7)).toBe(
      "-30 pts creditados ao responsável.",
    );
  });

  it("crédito zero é dito como zero (a penalidade comeu o prêmio inteiro)", () => {
    expect(completionAwardMessage({ awardedTo: 7, awardedPoints: 0 }, 7)).toBe("0 pts creditados a você.");
  });
});

describe("V4-5c · o cartão anuncia o creditado, não o projetado", () => {
  beforeEach(() => {
    resetTaskStore();
    installMatchMediaStub();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).matchMedia;
  });

  function renderBoard() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
      <SessionProvider session={null}>
        <QueryClientProvider client={queryClient}>
          <NuqsTestingAdapter searchParams="">
            <TaskBoard />
            <Toaster position="bottom-right" />
          </NuqsTestingAdapter>
        </QueryClientProvider>
      </SessionProvider>,
    );
  }

  it("conclusão direta: o número no toast é o da resposta (10), não o projetado (−20)", async () => {
    // Pública e vencida há 3 dias: projetado = 10 − 3·10 = −20. O mock credita 10.
    const dueDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    seedTasks([
      makeTask({
        id: 601,
        title: "Relatório vencido",
        status: "in-progress",
        taskVisibility: "public",
        assignedTo: 2,
        dueDate,
      }),
    ]);
    renderBoard();

    await userEvent.click(await screen.findByRole("button", { name: "Ações para Relatório vencido" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Concluído" }));

    // O aviso chega DEPOIS da resposta — é por isso que ele pode dizer o número verdadeiro.
    expect(await screen.findByText(/10 pts creditados a você/)).toBeInTheDocument();
    expect(screen.queryByText(/−20|−20 pts|-20 pts/)).not.toBeInTheDocument();

    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Ações para Relatório vencido" })).toHaveLength(1));
  });
});
