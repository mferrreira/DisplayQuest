/**
 * FloatingSessionTimer tabs test — the expanded floating panel is a tabgroup
 * with the current work-session tab and a second compact LabResponsibility
 * tab sharing the same global responsibility state.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FloatingSessionTimer } from "@/components/ui/floating-session-timer";

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
});

describe("FloatingSessionTimer tabgroup", () => {
  it("shows Sessão and Responsabilidade tabs when expanded, defaulting to Sessão", async () => {
    const user = userEvent.setup();
    render(<FloatingSessionTimer />);
    await user.click(screen.getByLabelText("Abrir timer de sessão"));
    expect(screen.getByRole("tab", { name: /sessão/i })).toBeVisible();
    expect(screen.getByRole("tab", { name: /responsabilidade/i })).toBeVisible();
    expect(screen.getByRole("tab", { name: /sessão/i })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("Sem sessão")).toBeVisible();
  });

  it("switches to the shared responsibility state on the second tab", async () => {
    const user = userEvent.setup();
    render(<FloatingSessionTimer />);
    await user.click(screen.getByLabelText("Abrir timer de sessão"));
    await user.click(screen.getByRole("tab", { name: /responsabilidade/i }));
    expect(await screen.findByText("Laboratório disponível")).toBeVisible();
    expect(screen.getByRole("button", { name: /estar responsável/i })).toBeVisible();
  });

  it("disables assume in the tab when someone else owns the responsibility", async () => {
    const user = userEvent.setup();
    responsibilityMock.activeResponsibility = {
      id: 9,
      userId: 2,
      userName: "Bruno",
      startTime: new Date().toISOString(),
      duration: 65,
      isPaused: false,
    };
    render(<FloatingSessionTimer />);
    await user.click(screen.getByLabelText("Abrir timer de sessão"));
    await user.click(screen.getByRole("tab", { name: /responsabilidade/i }));
    expect(await screen.findByText("Bruno")).toBeVisible();
    expect(screen.getByRole("button", { name: /estar responsável/i })).toBeDisabled();
  });
});
