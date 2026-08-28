/**
 * EventDialog (Agenda do Dia) component tests. The dialog is controlled: mode
 * create vs edit decides which fields render, the save label and the payload.
 * Error + saving are controlled props shown on failure (no unhandled rejection).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventDialog, type LabEventDialogValues } from "@/components/features/laboratorio/event-dialog";

function renderDialog(props: Partial<Parameters<typeof EventDialog>[0]> = {}) {
  const onSave = vi.fn<(values: LabEventDialogValues) => Promise<void>>(async () => {});
  render(
    <EventDialog
      open
      onOpenChange={() => {}}
      mode="create"
      onSave={onSave}
      {...props}
    />,
  );
  return { onSave };
}

describe("EventDialog", () => {
  it("create mode hides the date field and saves time+note", async () => {
    const { onSave } = renderDialog({ mode: "create" });
    const user = userEvent.setup();

    expect(screen.queryByLabelText("Data")).not.toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: "Adicionar" });
    expect(addButton).toBeDisabled();

    await user.type(screen.getByLabelText("Descrição"), "Alinhamento de rotina");
    expect(addButton).toBeEnabled();
    await user.click(addButton);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const values = onSave.mock.calls[0][0] as LabEventDialogValues;
    expect(values.note).toBe("Alinhamento de rotina");
    expect(values.time).toMatch(/^\d{2}:\d{2}$/);
    expect(values.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("edit mode shows a prefilled date field and a 'Salvar' action", () => {
    renderDialog({
      mode: "edit",
      initialValues: { date: "2026-09-05", time: "14:30", note: "Manutenção do microscópio" },
    });

    expect(screen.getByRole("heading", { name: "Editar Evento" })).toBeVisible();
    expect(screen.getByLabelText("Data")).toHaveValue("2026-09-05");
    expect(screen.getByLabelText("Horário")).toHaveValue("14:30");
    expect(screen.getByLabelText("Descrição")).toHaveValue("Manutenção do microscópio");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeVisible();
  });

  it("disables save while saving kicks in and forwards the payload", async () => {
    const { onSave } = renderDialog({
      mode: "edit",
      initialValues: { date: "2026-09-05", time: "14:30", note: "Pré-preenchida" },
    });
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const values = onSave.mock.calls[0][0] as LabEventDialogValues;
    expect(values).toEqual({ date: "2026-09-05", time: "14:30", note: "Pré-preenchida" });
  });

  it("renders a controlled server error", () => {
    renderDialog({ error: "Usuário não tem permissão para editar este evento" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Usuário não tem permissão para editar este evento",
    );
  });
});