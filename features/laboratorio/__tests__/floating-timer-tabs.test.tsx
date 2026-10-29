/**
 * FloatingSessionTimer panel test — the expanded floating panel renders the
 * work-session section AND, for the roles that run the lab (LABORATORISTA e
 * acima), the compact LabResponsibility section below it. There are no tabs:
 * the responsibility used to hide in a second tab nobody remembered to open.
 * The panel shares the same global responsibility state as the lab page.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingSessionTimer } from "@/components/ui/floating-session-timer";
import { ResponsibilitiesAPI } from "@/contexts/api-client";

const { workSessionsMock, authMock, projectMock, responsibilityMock } = vi.hoisted(() => {
  const workSessionsMock: any = {
    currentSession: null,
    activeSession: null,
    startSession: vi.fn(),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
    endSession: vi.fn(),
    fetchSessions: vi.fn(),
    getElapsedSeconds: () => 0,
    loading: false,
  };
  const authMock: any = { user: { id: 1, name: "Lia", roles: ["LABORATORISTA"] }, loading: false };
  const projectMock = { projects: [] as any[] };
  const responsibilityMock: any = {
    activeResponsibility: null,
    loading: false,
    error: null,
    fetchActiveResponsibility: vi.fn(),
    startResponsibility: vi.fn(),
    pauseResponsibility: vi.fn(),
    resumeResponsibility: vi.fn(),
    endResponsibility: vi.fn(),
  };
  return { workSessionsMock, authMock, projectMock, responsibilityMock };
});

vi.mock("@/hooks/use-work-sessions", () => ({
  useWorkSessions: () => workSessionsMock,
}));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => authMock,
}));
vi.mock("@/contexts/project-context", () => ({
  useProject: () => projectMock,
}));
vi.mock("@/contexts/responsibility-context", () => ({
  useResponsibility: () => responsibilityMock,
}));
vi.mock("@/contexts/api-client", () => ({
  ResponsibilitiesAPI: { pause: vi.fn(), resume: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  workSessionsMock.currentSession = null;
  workSessionsMock.activeSession = null;
  responsibilityMock.activeResponsibility = null;
  responsibilityMock.fetchActiveResponsibility.mockResolvedValue(undefined);
  authMock.user = { id: 1, name: "Lia", roles: ["LABORATORISTA"] };
});

// plan-v3 OND2-C: o botão fechado passou a anunciar o estado da sessão no nome acessível
// ("Sessão de trabalho ativa — abrir timer de sessão"), então a busca é por fragmento e
// funciona com e sem sessão aberta.
const openTimer = () => screen.getByLabelText(/abrir timer de sessão/i);

describe("FloatingSessionTimer panel", () => {
  it("renderiza sessão e responsabilidade juntas quando expandido — sem abas", async () => {
    const user = userEvent.setup();
    render(<FloatingSessionTimer />);
    await user.click(openTimer());
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("Sessão de Trabalho")).toBeVisible();
    expect(screen.getByText("Sem sessão")).toBeVisible();
    // A responsabilidade não espera clique em aba nenhuma: está abaixo da sessão.
    expect(await screen.findByText("Responsabilidade")).toBeVisible();
    expect(screen.getByText("Laboratório disponível")).toBeVisible();
  });

  it("mostra o estado compartilhado de responsabilidade sem nenhum clique", async () => {
    const user = userEvent.setup();
    render(<FloatingSessionTimer />);
    await user.click(openTimer());
    expect(await screen.findByText("Laboratório disponível")).toBeVisible();
    expect(screen.getByRole("button", { name: /estar responsável/i })).toBeVisible();
  });

  it("não monta a responsabilidade para quem não gere o laboratório", async () => {
    const user = userEvent.setup();
    authMock.user = { id: 3, name: "Vovô", roles: ["VOLUNTARIO"] };
    render(<FloatingSessionTimer />);
    await user.click(openTimer());
    expect(await screen.findByText("Sessão de Trabalho")).toBeVisible();
    expect(screen.queryByText("Responsabilidade")).not.toBeInTheDocument();
    expect(responsibilityMock.fetchActiveResponsibility).not.toHaveBeenCalled();
  });

  it("does not pause the responsibility when the session is paused manually", async () => {
    const user = userEvent.setup();
    const session = {
      id: 7,
      userId: 1,
      status: "active",
      startTime: new Date().toISOString(),
    };
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;
    render(<FloatingSessionTimer />);
    await user.click(openTimer());
    // Nome acessível exato: o painel tem o botão "Pausar" e o botão de informação do som,
    // cujo nome acessível é "Como funciona o som ao pausar" — casar por substring faz os
    // dois baterem e o teste cai em strict mode violation. `exact` não existe em
    // `ByRoleOptions` (TS2769), então a igualdade exata vem da regex ancorada. (O botão de
    // informação só apareceu quando o som passou a ser arquivo: antes,
    // `isAlertSoundSupported` media `AudioContext`, que o jsdom não implementa, e o botão
    // não era renderizado nenhum.)
    await user.click(screen.getByRole("button", { name: /^Pausar$/ }));
    await waitFor(() => expect(workSessionsMock.pauseSession).toHaveBeenCalledWith(7));
    expect(ResponsibilitiesAPI.pause).not.toHaveBeenCalled();
  });

  it("does not resume the responsibility when the session is resumed manually", async () => {
    const user = userEvent.setup();
    workSessionsMock.currentSession = {
      id: 7,
      userId: 1,
      status: "paused",
      startTime: new Date().toISOString(),
    };
    render(<FloatingSessionTimer />);
    await user.click(openTimer());
    await user.click(screen.getByRole("button", { name: /continuar/i }));
    await waitFor(() => expect(workSessionsMock.resumeSession).toHaveBeenCalledWith(7));
    expect(ResponsibilitiesAPI.resume).not.toHaveBeenCalled();
  });

  it("desabilita o assume quando a responsabilidade é de outro — sem aba", async () => {
    responsibilityMock.activeResponsibility = {
      id: 9,
      userId: 2,
      userName: "Bruno",
      startTime: new Date().toISOString(),
      duration: 65,
      isPaused: false,
    };
    const user = userEvent.setup();
    render(<FloatingSessionTimer />);
    await user.click(openTimer());
    expect(await screen.findByText("Bruno")).toBeVisible();
    expect(screen.getByRole("button", { name: /estar responsável/i })).toBeDisabled();
  });
});
