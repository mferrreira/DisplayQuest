/**
 * V4-4b — testes de UI do `components/admin/ModernAdminPanel.tsx`.
 *
 * Por que este arquivo existe: o painel tem 1063 linhas e ZERO testes, e já foi tocado duas
 * vezes (V4-6: o `min` do input de pontos passou a ser condicionado à ação). Aquela mudança
 * estava coberta só pelo gate de tipos — `tsc` não vê `min="0"` num JSX. O dono pediu cobertura
 * antes de mexer nele de novo (2026-10-06).
 *
 * O que estes testes fixam, na ordem em que o caminho existe no código:
 *   1. o painel renderiza para quem tem MANAGE_USERS, e a gestão de usuários NÃO aparece para
 *      quem não tem;
 *   2. a linha de um usuário tem um controle nomeado que abre o diálogo "Configurar Usuário";
 *   3. DEC-60 na UI: "Definir" não impõe mínimo, "Adicionar"/"Remover" impõem `min="0"`;
 *   4. DEC-60 no salvamento: "Definir" com valor NEGATIVO chega à API com o número negativo;
 *   5. as três chamadas do salvar saem na ordem e com o corpo certo (roles → usuário → pontos);
 *   6. `add`/`remove` com valor negativo não são enviados (as duas ações continuam
 *      não-negativas — chão em 0 e suficiência são regras próprias delas).
 *
 * Costura medida ao escrever: o painel decide quem pode pelo `hasAccess(user.roles, ...)` do
 * `useAuth`, e o `useTask` só é usado pela aba de tarefas. Os dois são mockados; o painel, os
 * diálogos e o `Select`/`Dialog` do Radix são os REAIS (shims de jsdom em tests/setup.ts).
 * A rede é MSW local, que grava o corpo recebido — é assim que "chegou à API" é provado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";

import { ModernAdminPanel } from "@/components/admin/ModernAdminPanel";
import { ProjectProvider } from "@/contexts/project-context";
import { UserProvider } from "@/contexts/user-context";
import { WorkSessionsProvider } from "@/contexts/work-sessions-context";
import { makeUser } from "@/tests/mocks/fixtures/users";
import { server } from "@/tests/mocks/server";

// ---- seams de contexto (o painel decide permissão a partir daqui) ----

const mocks = vi.hoisted(() => ({
  roles: ["COORDENADOR"] as string[],
  refresh: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({
    user: mocks.roles.length
      ? { id: 2, name: "Coordenador", email: "coord@lab.com", roles: mocks.roles }
      : null,
  }),
}));

vi.mock("@/contexts/task-context", () => ({
  useTask: () => ({
    tasks: [],
    approveTask: vi.fn(),
    rejectTask: vi.fn(),
    fetchTasks: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh, push: vi.fn(), replace: vi.fn() }),
}));

// ---- rede: o que o painel manda de verdade ----

type CapturedRequest = { method: string; path: string; body: any };

let captured: CapturedRequest[];

function captureRequests() {
  captured = [];
  const record = (method: string) => async ({ request, params }: any) => {
    captured.push({
      method,
      path: Object.values(params as Record<string, string>).join("/"),
      body: await request.json().catch(() => null),
    });
    return HttpResponse.json({ ok: true });
  };

  server.use(
    http.get("*/api/users/approve", () => HttpResponse.json({ pendingUsers: [] })),
    http.get("*/api/schedules", () => HttpResponse.json([])),
    http.get("*/api/tasks/global-progress", () => HttpResponse.json({ globalTasks: [] })),
    http.get("*/api/work-sessions", () => HttpResponse.json({ data: [] })),
    http.patch("*/api/users/:id/roles", record("PATCH-roles")),
    http.put("*/api/users/:id", record("PUT-user")),
    http.patch("*/api/users/:id/points", record("PATCH-points")),
    http.patch("*/api/users/:id/status", record("PATCH-status")),
  );
}

function findPointsInput() {
  // O input de pontos é o único `spinbutton` do diálogo sem associação com rótulo de seção.
  return screen.getByRole("spinbutton", { name: "Valor de pontos" });
}

async function openSettingsFor(name: string) {
  const tab = screen.getByRole("tab", { name: /usuários/i });
  await userEvent.click(tab);
  await userEvent.click(screen.getByRole("button", { name: `Configurar ${name}` }));
  await screen.findByRole("heading", { name: "Configurar Usuário" });
}

const alvo = () =>
  makeUser({
    id: 77,
    name: "Maria Silva",
    email: "maria@lab.com",
    points: 120,
    weekHours: 20,
    roles: ["VOLUNTARIO"],
    status: "active",
  });

function renderPanel(users?: any[]) {
  const list = users ?? [alvo()];
  render(
    // Medido ao escrever: o painel não renderiza sozinho. Ele monta `ManageWorkSessionsDialog`
    // (linha 1054) e `UserApproval` (linha 499) SEMPRE, e os dois chamam contexto no primeiro
    // render — fora da stack o painel inteiro explode ("useWorkSessions deve ser usado dentro
    // de …", "useProject deve ser usado dentro de …"). A stack abaixo é a do app
    // (`app/client-layout.tsx:26-34`), real, sem stub: o que está sob teste é o painel.
    <UserProvider>
      <ProjectProvider>
        <WorkSessionsProvider>
          <ModernAdminPanel
            users={list}
            projects={[]}
            tasks={[]}
            sessions={[]}
            stats={{ totalUsers: list.length, totalProjects: 0, totalTasks: 0, activeSessions: 0 }}
          />
        </WorkSessionsProvider>
      </ProjectProvider>
    </UserProvider>,
  );
  return list[0];
}

beforeEach(() => {
  mocks.roles = ["COORDENADOR"];
  mocks.refresh.mockClear();
  captureRequests();
});

describe("V4-4b · o painel renderiza e obedece à permissão", () => {
  it("COORDENADOR vê o painel e as abas", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "Painel Administrativo" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /usuários/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /tarefas/i })).toBeInTheDocument();
  });

  it("VOLUNTARIO (sem MANAGE_USERS) não vê a gestão de usuários", async () => {
    mocks.roles = ["VOLUNTARIO"];
    renderPanel();
    await userEvent.click(screen.getByRole("tab", { name: /usuários/i }));

    expect(screen.queryByText("Gestão de Usuários")).not.toBeInTheDocument();
    expect(screen.queryByText("Usuários do Sistema")).not.toBeInTheDocument();
  });
});

describe("V4-4b · o diálogo de configuração do usuário", () => {
  it("a linha do usuário tem um controle nomeado que abre o diálogo com o valor atual", async () => {
    const user = renderPanel();
    await openSettingsFor(user.name);

    // O texto é montado em três nós ("Atual: " + 120 + " pontos" + a dica da ação), então a
    // busca é por regex no nó do parágrafo, não pela frase inteira.
    expect(screen.getByText(/Atual: 120/)).toBeInTheDocument();
    expect((findPointsInput() as HTMLInputElement).value).toBe("120");
  });

  it("DEC-60 na UI: 'Definir' não impõe mínimo; 'Adicionar' e 'Remover' impõem min=0", async () => {
    renderPanel();
    await openSettingsFor("Maria Silva");

    expect(findPointsInput()).not.toHaveAttribute("min");
    expect(screen.getByText(/“Definir” aceita valor negativo/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: /ação de pontos/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Adicionar" }));
    expect(findPointsInput()).toHaveAttribute("min", "0");
    expect(screen.queryByText(/“Definir” aceita valor negativo/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: /ação de pontos/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Remover" }));
    expect(findPointsInput()).toHaveAttribute("min", "0");
  });

  it("DEC-60 no salvamento: 'Definir' com valor NEGATIVO chega à API com o número negativo", async () => {
    // É exatamente o que a DEC-60 abriu e o V4-6 não fechou: a premiação deixa o total de
    // alguém negativo (DEC-39) e a administração precisava conseguir escrever esse valor de
    // volta. O input passou a aceitar (min removido), mas o guard do salvamento ainda era
    // `pointsNum >= 0` — o valor era digitado e a chamada, pulada em silêncio.
    renderPanel();
    await openSettingsFor("Maria Silva");

    const input = findPointsInput();
    await userEvent.clear(input);
    await userEvent.type(input, "-20");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => {
      expect(captured.some((r) => r.method === "PATCH-points")).toBe(true);
    });
    expect(captured.find((r) => r.method === "PATCH-points")?.body).toEqual({
      action: "set",
      points: -20,
    });
  });

  it("o salvar dispara as três chamadas na ordem e com o corpo certo", async () => {
    renderPanel();
    await openSettingsFor("Maria Silva");

    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(captured.length).toBe(3));
    expect(captured.map((r) => r.method)).toEqual(["PATCH-roles", "PUT-user", "PATCH-points"]);
    expect(captured[0].body).toEqual({ action: "set", roles: ["VOLUNTARIO"] });
    expect(captured[1].body).toMatchObject({ name: "Maria Silva", email: "maria@lab.com", weekHours: 20 });
    expect(captured[2].body).toEqual({ action: "set", points: 120 });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("add/remove continuam não-negativos: valor negativo não é enviado", async () => {
    renderPanel();
    await openSettingsFor("Maria Silva");

    await userEvent.click(screen.getByRole("combobox", { name: /ação de pontos/i }));
    await userEvent.click(await screen.findByRole("option", { name: "Adicionar" }));

    const input = findPointsInput();
    await userEvent.clear(input);
    await userEvent.type(input, "-5");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(captured.some((r) => r.method === "PUT-user")).toBe(true));
    expect(captured.some((r) => r.method === "PATCH-points")).toBe(false);
  });

  it("campo de pontos vazio não envia `set 0`: esvaziar não zera os pontos de ninguém", async () => {
    // Caraterizado ao corrigir o guard: antes, `Number("")` é 0, `!isNaN(0)` e `0 >= 0` — o
    // painel enviava `{action:"set", points:0}` e zerava a conta de um usuário por um campo
    // esvaziado. É o mesmo quirk que a DEC-84 recusou no servidor (`points: null` → 0).
    renderPanel();
    await openSettingsFor("Maria Silva");

    await userEvent.clear(findPointsInput());
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(captured.some((r) => r.method === "PUT-user")).toBe(true));
    expect(captured.some((r) => r.method === "PATCH-points")).toBe(false);
  });
});

describe("V4-4b · o que acontece quando a API recusa", () => {
  it("um 400 no pontos aparece no diálogo (DEC-85 — antes era rejeição não tratada)", async () => {
    // Medido ao escrever este lote: `saveUserSettings` e `updateUserStatus` LANÇAVAM em toda
    // falância e ninguém capturava. O `onClick` devolvia a promise rejeitada, o React não tratava:
    // o diálogo continuava aberto sem uma linha de erro, e o `vitest` desta casa saía com exit 1
    // por "Unhandled Rejection" — ou seja, o defeito quebrava o gate de entrega.
    server.use(
      http.patch("*/api/users/:id/points", async ({ request }) => {
        captured.push({ method: "PATCH-points", path: "77", body: await request.json() });
        return HttpResponse.json({ error: "Pontos devem ser um número não negativo" }, { status: 400 });
      }),
    );

    renderPanel();
    await openSettingsFor("Maria Silva");
    await userEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() => expect(captured.some((r) => r.method === "PATCH-points")).toBe(true));

    // A mensagem é a do servidor, anunciada como alerta, dentro do diálogo onde a pessoa está.
    expect(await screen.findByRole("alert")).toHaveTextContent("Pontos devem ser um número não negativo");
    expect(screen.getByRole("heading", { name: "Configurar Usuário" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeEnabled();
  });

  it("uma recusa do PATCH de status também aparece no diálogo (o `confirm` do jsdom é stubado)", async () => {
    // `window.confirm` não é implementado no jsdom (lança "Not implemented"), então é stubado —
    // é o caminho que o botão "Suspender" usa antes de chamar a API.
    vi.stubGlobal("confirm", vi.fn(() => true));

    server.use(
      http.patch("*/api/users/:id/status", async () =>
        HttpResponse.json({ error: "Usuário não encontrado" }, { status: 404 }),
      ),
    );

    renderPanel();
    await openSettingsFor("Maria Silva");
    await userEvent.click(screen.getByRole("button", { name: "Suspender" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Usuário não encontrado");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("o confirm do 'Rejeitar' diz a verdade: a conta continua no sistema (ASK-V4-26)", async () => {
    // Medido: `reject` faz `status = "rejected"` (update-user-status.use-case.ts:16) e a linha
    // fica — login e API bloqueiam porque status !== active. O texto dizia o contrário:
    // "Esta ação irá removê-lo do sistema". O guia já diz a verdade em
    // docs/src-usuario/12-perguntas-frequentes.md:47.
    const confirmMock = vi.fn<(message?: string) => boolean>(() => true);
    vi.stubGlobal("confirm", confirmMock);

    renderPanel();
    await openSettingsFor("Maria Silva");
    await userEvent.click(screen.getByRole("button", { name: "Rejeitar" }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    const message = confirmMock.mock.calls[0]?.[0] ?? "";
    expect(message).not.toMatch(/remov/i);
    expect(message).toMatch(/continua no sistema/);
  });
});

describe("V4-4b · o filtro de status do painel", () => {
  it("o filtro oferece os status que o sistema escreve, e não oferece o que ninguém escreve (ASK-V4-27, ASK-V4-28)", async () => {
    // Medido no V4-4c: o painel cria `rejected` (botão Rejeitar) e `suspended` (botão Suspender), mas o
    // filtro só oferecia Ativo / Pendente / Inativo — então nenhum dos dois aparecia em filtro
    // específico, só em "Todos". E "Inativo" é opção morta: nenhum caminho do sistema escreve o
    // status `inactive` (a rota escreve active/rejected/suspended; entities/user.ts:31 enumera
    // pending/active/rejected/suspended). Registrado como ASK-V4-28.
    // DEC-95 (dono, 2026-10-06) autoriza remover a opção: inativar de verdade é "Suspender".
    renderPanel([
      alvo(),
      makeUser({ id: 78, name: "Rita Rejeitada", email: "rita@lab.com", status: "rejected" }),
      makeUser({ id: 79, name: "Rui Suspenso", email: "rui@lab.com", status: "suspended" }),
    ]);
    await userEvent.click(screen.getByRole("tab", { name: /usuários/i }));

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    const options = await screen.findAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toEqual(
      expect.arrayContaining(["Todos", "Ativo", "Pendente", "Rejeitado", "Suspenso"]),
    );
    expect(labels).not.toContain("Inativo");

    // Escopo: o botão "Configurar <nome>" só existe na lista filtrada ("Usuários do Sistema").
    // Medido ao escrever: o `ScheduleGrid` recebe a MESMA lista de usuários e a renderiza
    // inteira, sem o filtro do painel — então buscar pelo nome achava a pessoa na grade de
    // horários e o teste provava o oposto do que pretendia.
    await userEvent.click(screen.getByRole("option", { name: "Rejeitado" }));
    expect(screen.getByRole("button", { name: "Configurar Rita Rejeitada" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configurar Maria Silva" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("combobox", { name: "Status" }));
    await userEvent.click(await screen.findByRole("option", { name: "Suspenso" }));
    expect(screen.getByRole("button", { name: "Configurar Rui Suspenso" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configurar Rita Rejeitada" })).not.toBeInTheDocument();
  });
});
