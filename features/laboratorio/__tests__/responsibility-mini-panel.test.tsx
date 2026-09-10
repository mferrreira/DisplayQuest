/**
 * ResponsibilityMiniPanel tests — compact responsibility timer for the
 * floating session timer's second tab. Same state as /laboratorio via
 * useResponsibility(): assume/release + duration + paused state, disabled
 * when someone else owns the active responsibility.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { responsibilityMock, authMock } = vi.hoisted(() => {
  const responsibilityMock: any = {
    activeResponsibility: null,
    loading: false,
    error: null,
    fetchActiveResponsibility: vi.fn(),
    startResponsibility: vi.fn(),
    endResponsibility: vi.fn(),
    fetchResponsibilities: vi.fn(),
    responsibilities: [],
    updateNotes: vi.fn(),
    deleteResponsibility: vi.fn(),
  };
  const authMock: any = {
    user: { id: 1, name: "Lia", roles: ["LABORATORISTA"] },
    loading: false,
  };
  return { responsibilityMock, authMock };
});

vi.mock("@/contexts/responsibility-context", () => ({
  useResponsibility: () => responsibilityMock,
}));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => authMock,
}));

import { ResponsibilityMiniPanel } from "@/components/ui/responsibility-mini-panel";

beforeEach(() => {
  vi.clearAllMocks();
  responsibilityMock.activeResponsibility = null;
  responsibilityMock.loading = false;
  responsibilityMock.error = null;
  responsibilityMock.startResponsibility.mockResolvedValue(undefined);
  responsibilityMock.endResponsibility.mockResolvedValue(undefined);
  responsibilityMock.fetchActiveResponsibility.mockResolvedValue(undefined);
  authMock.user = { id: 1, name: "Lia", roles: ["LABORATORISTA"] };
});

describe("ResponsibilityMiniPanel", () => {
  it("refreshes the shared active responsibility on mount", async () => {
    render(<ResponsibilityMiniPanel />);
    await waitFor(() =>
      expect(responsibilityMock.fetchActiveResponsibility).toHaveBeenCalledTimes(1),
    );
  });

  it("shows the assume form when the lab is free and the user can assume", async () => {
    render(<ResponsibilityMiniPanel />);
    expect(await screen.findByText("Laboratório disponível")).toBeVisible();
    const button = screen.getByRole("button", { name: /estar responsável/i });
    expect(button).toBeEnabled();
    const user = userEvent.setup();
    await user.click(button);
    await waitFor(() => expect(responsibilityMock.startResponsibility).toHaveBeenCalledTimes(1));
  });

  it("disables assume and shows the owner when someone else is responsible", async () => {
    responsibilityMock.activeResponsibility = {
      id: 9,
      userId: 2,
      userName: "Bruno",
      startTime: new Date().toISOString(),
      duration: 65,
      isPaused: false,
    };
    render(<ResponsibilityMiniPanel />);
    expect(await screen.findByText("Bruno")).toBeVisible();
    expect(screen.getByRole("button", { name: /estar responsável/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /não sou mais responsável/i })).toBeNull();
  });

  it("shows timer, paused badge and release for the owner's active responsibility", async () => {
    responsibilityMock.activeResponsibility = {
      id: 10,
      userId: 1,
      userName: "Lia",
      startTime: new Date().toISOString(),
      duration: 3661,
      isPaused: true,
    };
    render(<ResponsibilityMiniPanel />);
    expect(await screen.findByText("PAUSADA")).toBeVisible();
    expect(screen.getByText("01:01:01")).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /não sou mais responsável/i }));
    await waitFor(() => expect(responsibilityMock.endResponsibility).toHaveBeenCalledTimes(1));
  });

  it("is read-only for roles that cannot assume responsibility", async () => {
    authMock.user = { id: 5, name: "Felipe", roles: ["VOLUNTARIO"] };
    render(<ResponsibilityMiniPanel />);
    expect(await screen.findByText(/apenas laboratoristas/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /estar responsável/i })).toBeNull();
  });
});
