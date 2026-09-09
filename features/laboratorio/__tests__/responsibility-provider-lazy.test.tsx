/**
 * ResponsibilityProvider lazy-list test — hoisting the provider to the global
 * dashboard layout must not fetch the full history everywhere. The history
 * list stays lazy (only loaded inside /laboratorio); the active
 * responsibility keeps loading globally.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

const { apiMock, authMock } = vi.hoisted(() => {
  const apiMock: any = {
    getAll: vi.fn(),
    getActive: vi.fn(),
  };
  const authMock: any = {
    user: { id: 1, name: "Lia", roles: ["LABORATORISTA"] },
    loading: false,
  };
  return { apiMock, authMock };
});

vi.mock("@/contexts/api-client", () => ({
  ResponsibilitiesAPI: apiMock,
}));
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => authMock,
}));

import { ResponsibilityProvider, useResponsibility } from "@/contexts/responsibility-context";

function Probe() {
  const { responsibilities } = useResponsibility();
  return <p>history:{responsibilities.length}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.getAll.mockResolvedValue({ responsibilities: [] });
  apiMock.getActive.mockResolvedValue({ activeResponsibility: null });
});

describe("ResponsibilityProvider lazy history", () => {
  it("fetches only the active responsibility on mount, not the full history", async () => {
    await act(async () => {
      render(
        <ResponsibilityProvider>
          <Probe />
        </ResponsibilityProvider>,
      );
    });
    await waitFor(() => expect(apiMock.getActive).toHaveBeenCalled());
    expect(apiMock.getAll).not.toHaveBeenCalled();
    expect(await screen.findByText("history:0")).toBeVisible();
  });

  it("loads the history on demand via fetchResponsibilities", async () => {
    let fetch: ((s?: string, e?: string) => Promise<void>) | null = null;
    function Capture() {
      const ctx = useResponsibility();
      fetch = ctx.fetchResponsibilities;
      return <p>history:{ctx.responsibilities.length}</p>;
    }
    await act(async () => {
      render(
        <ResponsibilityProvider>
          <Capture />
        </ResponsibilityProvider>,
      );
    });
    apiMock.getAll.mockResolvedValue({ responsibilities: [{ id: 1 }] });
    await act(async () => {
      await fetch!("2026-09-01", "2026-09-30");
    });
    expect(apiMock.getAll).toHaveBeenCalledWith("2026-09-01", "2026-09-30");
    expect(await screen.findByText("history:1")).toBeVisible();
  });
});
