/**
 * UpcomingEventsDialog component tests — MSW-backed (tests/mocks/handlers.ts).
 * The icon button opens a centered Dialog over the agenda showing the
 * "Próximos eventos" window (today..14 days, past excluded). Covers: lazy
 * fetch (content only after first open), the "hoje" badge, row → onSelectDay
 * + dialog closes, and the empty and error + retry states.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { UpcomingEventsDialog } from "../components/upcoming-events-dialog";
import { getLabEventStore, resetLabEventStore, seedLabEvents } from "@/tests/mocks/handlers";
import { labEventsFixture } from "@/tests/mocks/fixtures/lab-events";
import { server } from "@/tests/mocks/server";

function renderDialog(props: Partial<Parameters<typeof UpcomingEventsDialog>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <UpcomingEventsDialog {...props} />
    </QueryClientProvider>,
  );
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /próximos eventos/i }));
}

describe("UpcomingEventsDialog", () => {
  beforeEach(() => {
    resetLabEventStore();
  });

  it("only fetches on first open and lists events from today forward, skipping past ones", async () => {
    seedLabEvents(labEventsFixture());
    const user = userEvent.setup();
    renderDialog();

    // lazy: nothing behind the closed trigger until the dialog is opened
    expect(screen.queryByText("Reunião geral da manhã")).not.toBeInTheDocument();

    await openDialog(user);

    expect(await screen.findByText("Reunião geral da manhã")).toBeVisible();
    expect(screen.getByText("Entrega do relatório parcial")).toBeVisible();
    expect(screen.getByText("Manutenção do microscópio")).toBeVisible();
    // past event falls outside the 14-day window
    expect(screen.queryByText("Evento passado (fora da janela)")).not.toBeInTheDocument();
    // time of day renders under the note
    expect(screen.getByText(/09:30/)).toBeVisible();
  });

  it("marks today's event with a 'hoje' badge", async () => {
    seedLabEvents(labEventsFixture());
    const user = userEvent.setup();
    renderDialog();

    await openDialog(user);
    expect(await screen.findByText("hoje")).toBeVisible();
    const todayRow = getLabEventStore().find((e) => e.note === "Reunião geral da manhã")!;
    expect(new Date(todayRow.date).toDateString()).toBe(new Date().toDateString());
  });

  it("clicking a row calls onSelectDay with that event's date and closes the dialog", async () => {
    const fixture = labEventsFixture();
    seedLabEvents(fixture);
    const onSelectDay = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onSelectDay });

    await openDialog(user);
    const row = await screen.findByRole("button", { name: /reunião geral da manhã/i });
    await user.click(row);

    expect(onSelectDay).toHaveBeenCalledTimes(1);
    const [calledDate] = onSelectDay.mock.calls[0] as [Date];
    expect(calledDate.getTime()).toBe(new Date(fixture[0].date).getTime());
    // dialog closes again after selecting the day
    await waitFor(() => expect(screen.queryByText("Reunião geral da manhã")).not.toBeInTheDocument());
  });

  it("shows the empty state when there are no events ahead", async () => {
    seedLabEvents([]);
    const user = userEvent.setup();
    renderDialog();

    await openDialog(user);
    expect(await screen.findByText(/nenhum evento nos próximos 14 dias/i)).toBeVisible();
  });

  it("shows an inline error with retry that recovers", async () => {
    seedLabEvents(labEventsFixture());
    server.use(http.get("*/api/lab-events/upcoming", () => HttpResponse.json({ error: "erro" }, { status: 500 })));
    const user = userEvent.setup();
    renderDialog();

    await openDialog(user);
    const retry = await screen.findByRole("button", { name: /tentar novamente/i });
    expect(screen.getByText(/não foi possível carregar os próximos eventos/i)).toBeVisible();

    server.resetHandlers(); // restore default handler, then retry
    await user.click(retry);
    expect(await screen.findByText("Reunião geral da manhã")).toBeVisible();
  });
});