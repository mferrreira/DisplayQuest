import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionWelcomeBalloon } from "@/components/ui/session-welcome-balloon";

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SessionWelcomeBalloon", () => {
  it("renders nothing when the user is not logged in", () => {
    const { container } = render(
      <SessionWelcomeBalloon isLoggedIn={false} hasNoSession onStartSession={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when a session exists", () => {
    const { container } = render(
      <SessionWelcomeBalloon isLoggedIn hasNoSession={false} onStartSession={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows for a logged-in user without a session and invites to start one", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<SessionWelcomeBalloon isLoggedIn hasNoSession onStartSession={onStart} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/bem-vindo/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /iniciar sessão/i }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("dismisses and persists dismissal via sessionStorage", async () => {
    const user = userEvent.setup();
    render(<SessionWelcomeBalloon isLoggedIn hasNoSession onStartSession={() => {}} />);

    expect(screen.getByRole("status")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /dispensar convite/i }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("session-welcome-balloon-dismissed")).toBe("1");

    // Re-rendering (e.g. state update) stays dismissed within this browser session
    render(<SessionWelcomeBalloon isLoggedIn hasNoSession onStartSession={() => {}} />);
    // The first instance already unmounted its balloon; no duplicate balloons appear.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
