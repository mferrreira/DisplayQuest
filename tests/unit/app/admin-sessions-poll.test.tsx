/**
 * V4-7 (2026-10-09) — a lista de sessões do painel administrativo se atualiza sozinha.
 *
 * Medido antes: o painel buscava as sessões uma vez no mount, então uma pausa feita no
 * cronômetro flutuante ou uma sessão fechada pelo cron da madrugada só aparecia depois de
 * um refresh inteiro da página. A busca agora repete a cada 30 s (o mesmo ciclo do
 * cronômetro flutuante) e uma ação no diálogo de sessões força a busca na hora.
 *
 * Este arquivo testa a PÁGINA, não o painel: é ela que tem o estado e o intervalo. O painel
 * continua sendo testado em `admin-panel-user-settings.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";

import AdminDashboardPage from "@/app/(dashboard)/dashboard/admin/page";
import { ProjectProvider } from "@/contexts/project-context";
import { UserProvider } from "@/contexts/user-context";
import { WorkSessionsProvider } from "@/contexts/work-sessions-context";

const mocks = vi.hoisted(() => ({ getAll: vi.fn(async () => [] as unknown[]) }));

const authMocks = vi.hoisted(() => ({
  user: { id: 2, name: "Coordenador", email: "coord@lab.com", roles: ["COORDENADOR"] },
}));

vi.mock("@/contexts/auth-context", () => ({
  // Objeto ESTÁVEL: o `UserProvider` guarda `user.roles` num `useCallback`, e um array novo a
  // cada render reinicia o efeito de busca para sempre (medido: `GET /api/users` em laço até
  // o teste estourar o tempo).
  useAuth: () => ({ user: authMocks.user, loading: false }),
}));

vi.mock("@/contexts/task-context", () => ({
  useTask: () => ({ tasks: [], approveTask: vi.fn(), rejectTask: vi.fn(), fetchTasks: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/contexts/api-client", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, WorkSessionsAPI: { ...(actual.WorkSessionsAPI as object), getAll: mocks.getAll } };
});

function renderPage() {
  // A stack real dos providers: o painel monta o diálogo de sessões, que lê o contexto de
  // work sessions no primeiro render (mesma costura medida em admin-panel-user-settings).
  return render(
    <UserProvider>
      <ProjectProvider>
        <WorkSessionsProvider>
          <AdminDashboardPage />
        </WorkSessionsProvider>
      </ProjectProvider>
    </UserProvider>,
  );
}

beforeEach(() => {
  mocks.getAll.mockClear();
  mocks.getAll.mockImplementation(async () => []);
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("painel administrativo · sessões ao vivo", () => {
  // Duas buscas no mount, não uma: a da página e a do `WorkSessionsProvider`, que busca as
  // próprias sessões do usuário logado. O que este teste fixa é a terceira em diante.
  it("busca as sessões ao montar", async () => {
    await act(async () => {
      renderPage();
    });

    expect(mocks.getAll).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "Painel Administrativo" })).toBeInTheDocument();
  });

  it("repete a busca a cada 30 s, sem refresh da página", async () => {
    await act(async () => {
      renderPage();
    });
    expect(mocks.getAll).toHaveBeenCalledTimes(2);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });
    expect(mocks.getAll).toHaveBeenCalledTimes(3);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(mocks.getAll).toHaveBeenCalledTimes(5);
  });

  it("a sessão que a API devolve aparece no cartão", async () => {
    mocks.getAll.mockImplementation(async () => [
      { id: 501, userId: 2, status: "active", startTime: new Date("2026-10-09T12:00:00.000Z"), activity: "plantao" },
    ]);

    await act(async () => {
      renderPage();
    });

    expect(await screen.findByText(/1 sessão ativa ou pausada/)).toBeInTheDocument();
    // "Coordenador" aparece mais de uma vez no painel (cabeçalho e linha do cartão), então a
    // busca é pela linha do cartão: o nome dentro do item que tem "Trabalhando".
    const trabalhando = await screen.findByText("Trabalhando");
    const linha = trabalhando.closest("div.flex.items-center");
    expect(linha?.textContent).toContain("Coordenador");
    expect(linha?.textContent).toContain("Iniciado:");
  });

  it("desmontar a página para o intervalo", async () => {
    let view: ReturnType<typeof render>;
    await act(async () => {
      view = renderPage();
    });
    expect(mocks.getAll).toHaveBeenCalledTimes(2);

    await act(async () => {
      view!.unmount();
      vi.advanceTimersByTime(90_000);
    });

    expect(mocks.getAll).toHaveBeenCalledTimes(2);
  });
});
