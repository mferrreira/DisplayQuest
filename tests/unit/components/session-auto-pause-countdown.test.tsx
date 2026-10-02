import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { SessionAutoPauseCountdown } from "@/components/ui/session-auto-pause-countdown";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SessionAutoPauseCountdown", () => {
  it("renders nothing when there is no active session", () => {
    vi.setSystemTime(new Date("2026-08-25T13:45:00Z")); // 10:45 SP
    const { container } = render(
      <SessionAutoPauseCountdown sessionStatus="paused" startTime={new Date("2026-08-25T12:00:00Z")} />,
    );
    expect(container).toBeEmptyDOMElement();

    render(
      <SessionAutoPauseCountdown sessionStatus={null} startTime={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows hours and minutes until the next scheduled pause", async () => {
    // 10:45:00 SP -> next pause 12:00 SP = 1h15m
    vi.setSystemTime(new Date("2026-08-25T13:45:00Z"));
    render(
      <SessionAutoPauseCountdown
        sessionStatus="active"
        startTime={new Date("2026-08-25T13:40:00Z")}
      />,
    );
    expect(screen.getByText(/pausa automática em 1h 15min/i)).toBeInTheDocument();
  });

  it("updates the countdown as time passes (intelligent refresh)", () => {
    // 10:00:00 SP -> next pause 12:00 SP = 2h 0min
    vi.setSystemTime(new Date("2026-08-25T13:00:00Z"));
    render(
      <SessionAutoPauseCountdown
        sessionStatus="active"
        startTime={new Date("2026-08-25T14:50:00Z")}
      />,
    );
    expect(screen.getByText(/pausa automática em 2h 0min/i)).toBeInTheDocument();

    // advance 1 minute without crossing a pause: countdown refreshes
    // 10:00:00 -> 12:00 SP = 2h 0min; after 61s -> 1h 59min
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText(/pausa automática em 1h 59min/i)).toBeInTheDocument();
  });

  it("shows an immediate warning when the session already crossed a pause", () => {
    // started 09:00 SP, now 09:35 SP -> 09:30 pause crossed (backend catching up)
    vi.setSystemTime(new Date("2026-08-25T12:35:00Z"));
    render(
      <SessionAutoPauseCountdown
        sessionStatus="active"
        startTime={new Date("2026-08-25T12:00:00Z")}
      />,
    );
    expect(screen.getByText(/será pausada automaticamente/i)).toBeInTheDocument();
  });
});
