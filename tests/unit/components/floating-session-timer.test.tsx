import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { FloatingSessionTimer } from "@/components/ui/floating-session-timer";

const { workSessionsMock, authMock, projectMock } = vi.hoisted(() => {
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
  return { workSessionsMock, authMock, projectMock };
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  workSessionsMock.currentSession = null;
  workSessionsMock.activeSession = null;
  workSessionsMock.pauseSession.mockResolvedValue(undefined);
  workSessionsMock.fetchSessions.mockResolvedValue(undefined);
});

afterEach(() => {
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
      screen.getByLabelText("Abrir timer de sessão").click();
    });

    await act(async () => {
      vi.advanceTimersByTime(65_000);
    });
    expect(screen.getByText("00:01:05")).toBeInTheDocument();
  });
});
