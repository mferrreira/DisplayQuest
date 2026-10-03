import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { FloatingSessionTimer } from "@/components/ui/floating-session-timer";
import { SESSION_NOTES_DEBOUNCE_MS, sessionNotesKey } from "@/components/ui/session-notes-draft";
import { PAUSE_SOUND_KEY } from "@/components/ui/session-alert";

const { workSessionsMock, authMock, projectMock, alertSoundMock } = vi.hoisted(() => {
  const workSessionsMock: any = {
    currentSession: null,
    activeSession: null,
    startSession: vi.fn(),
    pauseSession: vi.fn(),
    resumeSession: vi.fn(),
    endSession: vi.fn(),
    fetchSessions: vi.fn(),
    getElapsedSeconds: (session?: any) => {
      if (!session) return 0;
      const accumulated = typeof session.duration === "number" ? session.duration : 0;
      if (session.status === "active" && session.startTime) {
        const start = new Date(session.startTime).getTime();
        const now = Date.now();
        return Math.floor(accumulated + Math.max(0, (now - start) / 1000));
      }
      return Math.floor(accumulated);
    },
    loading: false,
  };
  const authMock = { user: { id: 1, roles: [] } as any, loading: false };
  const projectMock = { projects: [] as any[] };
  const alertSoundMock = { playAlertSound: vi.fn(), isAlertSoundSupported: vi.fn() };
  return { workSessionsMock, authMock, projectMock, alertSoundMock };
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
// OND2-C: o som é uma costura em lib/ (padrão da casa — o teste dublê a lib, não o
// builtin). O contexto WebAudio não existe em jsdom de todo modo.
vi.mock("@/lib/notifications/alert-sound", () => ({
  playAlertSound: alertSoundMock.playAlertSound,
  isAlertSoundSupported: alertSoundMock.isAlertSoundSupported,
}));
// Gotcha AGENTS.md: o auto-pause chama ResponsibilitiesAPI.pause() depois de
// pauseSession(). Sem este mock a chamada vai pro MSW, fica pendente, e a linha
// seguinte (setShowAutoPauseDialog(true)) nunca executa dentro do act().
vi.mock("@/contexts/api-client", () => ({
  ResponsibilitiesAPI: {
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    getActive: vi.fn().mockResolvedValue({ activeResponsibility: null }),
  },
}));

function makeSession(partial: { id: number; status: string; startTime: Date; duration?: number }) {
  return {
    id: partial.id,
    userId: 1,
    status: partial.status,
    startTime: partial.startTime,
    duration: partial.duration ?? 0,
    activity: "dev",
  };
}

// Medido nesta base (2026-10-02): o jsdom do Vitest não popula `window.localStorage`
// (`window === globalThis` e a Web Storage do jsdom vive em `globalThis.jsdom.window`).
// A Onda 2 precisa de storage de verdade, então um Map em memória é instalado aqui.
let storageData: Map<string, string>;

function installMemoryStorage() {
  storageData = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => (storageData.has(key) ? (storageData.get(key) as string) : null),
      setItem: (key: string, value: string) => storageData.set(key, value),
      removeItem: (key: string) => storageData.delete(key),
      clear: () => storageData.clear(),
      key: () => null,
      get length() {
        return storageData.size;
      },
    },
  });
}

function draftText(sessionId: number): string | null {
  return storageData.get(sessionNotesKey(sessionId)) ?? null;
}

/** Digita no rascunho e deixa o debounce expirar. */
async function typeDraft(text: string) {
  await act(async () => {
    fireEvent.change(screen.getByTestId("session-notes-draft"), { target: { value: text } });
    vi.advanceTimersByTime(SESSION_NOTES_DEBOUNCE_MS + 50);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  installMemoryStorage();
  workSessionsMock.currentSession = null;
  workSessionsMock.activeSession = null;
  workSessionsMock.pauseSession.mockResolvedValue(undefined);
  workSessionsMock.fetchSessions.mockResolvedValue(undefined);
  // Padrão do produto: som desligado. Os testes que quiserem som ligam por preferência.
  alertSoundMock.playAlertSound.mockReturnValue(true);
  alertSoundMock.isAlertSoundSupported.mockReturnValue(true);
});

/** Liga a preferência do som **antes** da montagem, que é quando ela é lida. */
function preferSoundOn() {
  storageData.set(PAUSE_SOUND_KEY, JSON.stringify(true));
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).localStorage;
  vi.useRealTimers();
});

describe("FloatingSessionTimer scheduled auto-pause", () => {
  it("pauses exactly at the next scheduled pause instant", async () => {
    // 10:45 SP; next pause 12:00 SP (75 min away).
    vi.setSystemTime(new Date("2026-08-25T13:45:00Z"));
    const session = makeSession({ id: 7, status: "active", startTime: new Date("2026-08-25T13:40:00Z") });
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;

    render(<FloatingSessionTimer />);

    // One second short of the boundary: still active, no pause.
    await act(async () => {
      vi.advanceTimersByTime(74 * 60_000);
    });
    expect(workSessionsMock.pauseSession).not.toHaveBeenCalled();

    // Crossing the boundary: pause fires once, with the session id.
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(workSessionsMock.pauseSession).toHaveBeenCalledTimes(1);
    expect(workSessionsMock.pauseSession).toHaveBeenCalledWith(7);
    expect(screen.getByText("Sessão pausada automaticamente")).toBeInTheDocument();
  });

  it("pauses immediately when the boundary was already crossed at mount", async () => {
    // 12:35 SP, session started 11:00 SP -> 12:00 SP already crossed.
    vi.setSystemTime(new Date("2026-08-25T15:35:00Z"));
    const session = makeSession({ id: 8, status: "active", startTime: new Date("2026-08-25T14:00:00Z") });
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;

    await act(async () => {
      render(<FloatingSessionTimer />);
    });

    expect(workSessionsMock.pauseSession).toHaveBeenCalledTimes(1);
    expect(workSessionsMock.pauseSession).toHaveBeenCalledWith(8);
  });

  it("never auto-pauses a paused session", async () => {
    vi.setSystemTime(new Date("2026-08-25T13:00:00Z"));
    const session = makeSession({ id: 9, status: "paused", startTime: new Date("2026-08-25T12:45:00Z") });
    workSessionsMock.currentSession = session;

    render(<FloatingSessionTimer />);

    // Advance across the 12:00 SP boundary and well beyond.
    await act(async () => {
      vi.advanceTimersByTime(3 * 60 * 60_000);
    });
    expect(workSessionsMock.pauseSession).not.toHaveBeenCalled();
  });

  it("fires exactly once even if timers keep running past the boundary", async () => {
    vi.setSystemTime(new Date("2026-08-25T13:45:00Z"));
    const session = makeSession({ id: 10, status: "active", startTime: new Date("2026-08-25T13:40:00Z") });
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;

    render(<FloatingSessionTimer />);

    // Run 3h past the boundary (multiple 30s polls and re-renders included).
    await act(async () => {
      vi.advanceTimersByTime(3 * 60 * 60_000);
    });
    expect(workSessionsMock.pauseSession).toHaveBeenCalledTimes(1);
    expect(workSessionsMock.pauseSession).toHaveBeenCalledWith(10);
  });

  it("keeps ticking the elapsed clock while a session is active", async () => {
    vi.setSystemTime(new Date("2026-08-25T13:00:00Z"));
    const session = makeSession({ id: 11, status: "active", startTime: new Date("2026-08-25T13:00:00Z") });
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;

    render(<FloatingSessionTimer />);

    // Expand the collapsed panel so the elapsed clock is visible.
    await act(async () => {
      screen.getByLabelText(/abrir timer de sessão/i).click();
    });

    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByText("00:01:05")).toBeInTheDocument();
  });
});

describe("FloatingSessionTimer anotações da sessão (OND2-B)", () => {
  const LOG_PLACEHOLDER = "Descreva o que foi feito nesta sessão...";

  async function openPanelWithSession(id: number) {
    vi.setSystemTime(new Date("2026-08-25T13:00:00Z"));
    const session = makeSession({ id, status: "active", startTime: new Date("2026-08-25T13:00:00Z") });
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;

    await act(async () => {
      render(<FloatingSessionTimer />);
    });
    await act(async () => {
      screen.getByLabelText(/abrir timer de sessão/i).click();
    });
    return session;
  }

  it("leva o rascunho para a caixa de log ao abrir 'Parar', e a segue editável", async () => {
    await openPanelWithSession(21);
    await typeDraft("montei o relatório da rodada");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Parar/ }));
    });

    const log = screen.getByPlaceholderText(LOG_PLACEHOLDER);
    expect(log).toHaveValue("montei o relatório da rodada");
    // Editável: quem abre o diálogo ainda pode mudar o texto final.
    await act(async () => {
      fireEvent.change(log, { target: { value: "montei o relatório da rodada (bis)" } });
    });
    expect(log).toHaveValue("montei o relatório da rodada (bis)");
    expect(screen.getByRole("button", { name: "Encerrar sessão" })).toBeEnabled();
  });

  it("falha ao encerrar mantém o texto e mostra o erro (antes era rejection silencioso)", async () => {
    await openPanelWithSession(22);
    await typeDraft("análise do experimento 4");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Parar/ }));
    });
    workSessionsMock.endSession.mockRejectedValue(new Error("500 Internal Server Error"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Encerrar sessão" }));
      vi.advanceTimersByTime(SESSION_NOTES_DEBOUNCE_MS + 50);
    });

    // O diálogo continua aberto com o texto, e o rascunho volta a estar guardado.
    expect(screen.getByPlaceholderText(LOG_PLACEHOLDER)).toHaveValue("análise do experimento 4");
    expect(screen.getByRole("alert")).toHaveTextContent(/não foi possível encerrar/i);
    expect(draftText(22)).toBe("análise do experimento 4");
  });

  it("encerrar com sucesso limpa o rascunho daquela sessão", async () => {
    const session = await openPanelWithSession(23);
    await typeDraft("revisão de código");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Parar/ }));
    });
    workSessionsMock.endSession.mockResolvedValue(undefined);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Encerrar sessão" }));
      vi.advanceTimersByTime(SESSION_NOTES_DEBOUNCE_MS + 50);
    });

    expect(workSessionsMock.endSession).toHaveBeenCalledWith(session.id, "dev", {
      dailyLogNote: "revisão de código",
    });
    expect(draftText(23)).toBeNull();
    expect(screen.queryByPlaceholderText(LOG_PLACEHOLDER)).not.toBeInTheDocument();
  });

  it("o rascunho da pausa automática também chega ao log", async () => {
    vi.setSystemTime(new Date("2026-08-25T13:45:00Z"));
    const session = makeSession({ id: 24, status: "active", startTime: new Date("2026-08-25T13:40:00Z") });
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;

    await act(async () => {
      render(<FloatingSessionTimer />);
    });
    await act(async () => {
      screen.getByLabelText(/abrir timer de sessão/i).click();
    });
    await typeDraft("chegou ao limite das 12h");

    // Cruza a pausa programada: o diálogo de pausa automática aparece.
    await act(async () => {
      vi.advanceTimersByTime(75 * 60_000);
    });
    expect(screen.getByText("Sessão pausada automaticamente")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Encerrar sessão" }));
    });

    expect(screen.getByPlaceholderText(LOG_PLACEHOLDER)).toHaveValue("chegou ao limite das 12h");
  });
});

describe("FloatingSessionTimer alerta de pausa (OND2-C)", () => {
  /** 10:45 SP com sessão ativa: cruzar 75 min dispara a pausa programada das 12:00. */
  async function renderBeforeAutoPause(id: number) {
    vi.setSystemTime(new Date("2026-08-25T13:45:00Z"));
    const session = makeSession({ id, status: "active", startTime: new Date("2026-08-25T13:40:00Z") });
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;
    let utils!: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<FloatingSessionTimer />);
    });
    return { session, ...utils };
  }

  /** Cruza a pausa programada e reflete o estado pausado que o servidor devolveria. */
  async function crossAutoPause(id: number, utils: { rerender: (ui: React.ReactElement) => void }) {
    await act(async () => {
      vi.advanceTimersByTime(75 * 60_000);
    });
    workSessionsMock.currentSession = makeSession({
      id,
      status: "paused",
      startTime: new Date("2026-08-25T13:40:00Z"),
    });
    workSessionsMock.activeSession = null;
    await act(async () => {
      utils.rerender(<FloatingSessionTimer />);
    });
  }

  it("pausa automática toca o som quando a preferência está ligada", async () => {
    preferSoundOn();
    const { session, rerender } = await renderBeforeAutoPause(31);

    await crossAutoPause(31, { rerender });

    expect(workSessionsMock.pauseSession).toHaveBeenCalledWith(session.id);
    expect(alertSoundMock.playAlertSound).toHaveBeenCalledWith("pause");
  });

  it("com o som desligado (padrão), a pausa automática é só visual", async () => {
    const { rerender } = await renderBeforeAutoPause(32);

    await crossAutoPause(32, { rerender });

    expect(screen.getByText("Sessão pausada automaticamente")).toBeInTheDocument();
    expect(alertSoundMock.playAlertSound).not.toHaveBeenCalled();
  });

  it("pausa manual também toca o som", async () => {
    preferSoundOn();
    vi.setSystemTime(new Date("2026-08-25T13:10:00Z"));
    const session = makeSession({ id: 33, status: "active", startTime: new Date("2026-08-25T13:00:00Z") });
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;

    await act(async () => {
      render(<FloatingSessionTimer />);
    });
    await act(async () => {
      screen.getByLabelText(/abrir timer de sessão/i).click();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Pausar/ }));
    });

    expect(workSessionsMock.pauseSession).toHaveBeenCalledWith(33);
    expect(alertSoundMock.playAlertSound).toHaveBeenCalledWith("pause");
  });

  it("o cronômetro fechado diz que a sessão está pausada (antes não dizia nada)", async () => {
    workSessionsMock.currentSession = makeSession({
      id: 34,
      status: "paused",
      startTime: new Date("2026-08-25T13:00:00Z"),
    });

    await act(async () => {
      render(<FloatingSessionTimer />);
    });

    expect(screen.getByLabelText(/sessão de trabalho pausada/i)).toBeInTheDocument();
    expect(screen.getByTestId("session-timer-icon-paused")).toBeInTheDocument();
    expect(screen.queryByTestId("session-timer-auto-pause-dot")).not.toBeInTheDocument();
  });

  it("sessão ativa é rotulada como ativa; sem sessão, o rótulo segue o de sempre", async () => {
    workSessionsMock.currentSession = makeSession({
      id: 35,
      status: "active",
      startTime: new Date("2026-08-25T13:00:00Z"),
    });

    const { unmount } = render(<FloatingSessionTimer />);
    expect(screen.getByLabelText(/sessão de trabalho ativa/i)).toBeInTheDocument();
    unmount();

    workSessionsMock.currentSession = null;
    render(<FloatingSessionTimer />);
    expect(screen.getByLabelText(/^abrir timer de sessão$/i)).toBeInTheDocument();
    expect(screen.getByTestId("session-timer-icon-clock")).toBeInTheDocument();
  });

  it("depois da pausa automática o botão pulsa até alguém retomar", async () => {
    const { rerender } = await renderBeforeAutoPause(36);
    expect(screen.queryByTestId("session-timer-auto-pause-dot")).not.toBeInTheDocument();

    await crossAutoPause(36, { rerender });

    // O sinal fica mesmo com o diálogo aberto em cima: é para quem está em outra aba.
    // (O diálogo modal marca o resto da página como aria-hidden, então a prova é o
    // atributo do botão, não uma consulta por papel acessível.)
    expect(screen.getByTestId("floating-session-timer-collapsed")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("pausada automaticamente"),
    );
    expect(screen.getByTestId("session-timer-auto-pause-dot")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continuar sessão" }));
    });
    workSessionsMock.currentSession = makeSession({
      id: 36,
      status: "active",
      startTime: new Date("2026-08-25T13:40:00Z"),
    });
    await act(async () => {
      rerender(<FloatingSessionTimer />);
    });

    expect(screen.getByLabelText(/sessão de trabalho ativa/i)).toBeInTheDocument();
    expect(screen.queryByTestId("session-timer-auto-pause-dot")).not.toBeInTheDocument();
  });

  it("o interruptor liga o som, guarda a preferência e toca a prévia", async () => {
    vi.setSystemTime(new Date("2026-08-25T13:00:00Z"));
    const session = makeSession({ id: 37, status: "active", startTime: new Date("2026-08-25T13:00:00Z") });
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;

    await act(async () => {
      render(<FloatingSessionTimer />);
    });
    await act(async () => {
      screen.getByLabelText(/abrir timer de sessão/i).click();
    });

    const toggle = screen.getByTestId("session-alert-sound");
    expect(toggle).toHaveAttribute("data-state", "unchecked");

    await act(async () => {
      fireEvent.click(toggle);
    });

    expect(toggle).toHaveAttribute("data-state", "checked");
    expect(storageData.get(PAUSE_SOUND_KEY)).toBe("true");
    // A prévia é o que destrava o áudio pela política de autoplay: sem ela, "ligado" seria
    // uma promessa que o navegador pode não cumprir.
    expect(alertSoundMock.playAlertSound).toHaveBeenCalledWith("pause");
  });

  it("sem suporte a WebAudio o interruptor fica desabilitado e explica", async () => {
    alertSoundMock.isAlertSoundSupported.mockReturnValue(false);
    vi.setSystemTime(new Date("2026-08-25T13:00:00Z"));
    const session = makeSession({ id: 38, status: "active", startTime: new Date("2026-08-25T13:00:00Z") });
    workSessionsMock.currentSession = session;
    workSessionsMock.activeSession = session;

    await act(async () => {
      render(<FloatingSessionTimer />);
    });
    await act(async () => {
      screen.getByLabelText(/abrir timer de sessão/i).click();
    });

    expect(screen.getByTestId("session-alert-sound")).toBeDisabled();
    expect(screen.getByText(/não permite tocar som/i)).toBeInTheDocument();
  });

  it("sem sessão aberta não há interruptor: não há pausa para avisar", async () => {
    await act(async () => {
      render(<FloatingSessionTimer />);
    });
    await act(async () => {
      screen.getByLabelText(/^abrir timer de sessão$/i).click();
    });

    expect(screen.queryByTestId("session-alert-sound")).not.toBeInTheDocument();
  });
});
