/**
 * plan-v13 S01 — campo "Subtítulo" no formulário de projeto (regra 1 do MODELO.md).
 *
 * O duplo do `createProject`/`updateProject` não reimplementa regra: só guarda o payload que a
 * tela montou, e as asserções são sobre o corpo. Padrão do `project-dialog-wizard.test.tsx`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ProjectDialog } from "@/components/features/project-dialog";
import type { ProjectFormData } from "@/contexts/types";

const captured = {
  createPayload: null as ProjectFormData | null,
  updatePayload: null as Record<string, unknown> | null,
};

const users = [
  { id: 1, name: "Coordenadora Ana", roles: ["COORDENADOR"] },
];

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, name: "Coordenadora Ana", roles: ["COORDENADOR"] } }),
}));

vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({ users: usersRef() }),
}));

vi.mock("@/contexts/project-context", () => ({
  useProject: () => ({
    async createProject(data: ProjectFormData) {
      captured.createPayload = data;
      return { id: 99 } as never;
    },
    async updateProject(_id: number, payload: Record<string, unknown>) {
      captured.updatePayload = payload;
      return {} as never;
    },
  }),
}));

vi.mock("@/lib/api/project-members", () => ({
  listProjectMembers: async () => [],
  syncProjectVolunteers: async () => {},
}));

// Só uma função: o factory é hoisted e chamar um valor do corpo ali cai em TDZ.
function usersRef() {
  return users as never;
}

function renderDialog(project?: never) {
  return render(<ProjectDialog open onOpenChange={vi.fn()} project={project} />);
}

beforeEach(() => {
  captured.createPayload = null;
  captured.updatePayload = null;
});

describe("campo Subtítulo no formulário de projeto", () => {
  it("a criação tem o campo Subtítulo e ele sai no payload", async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();

    await user.type(screen.getByLabelText("Subtítulo do projeto"), "Estudo de IA aplicada");
    await user.type(screen.getByLabelText("Nome do Projeto"), "Pesquisa em IA");
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Avançar" }));
    await user.click(screen.getByRole("button", { name: "Criar" }));

    expect(captured.createPayload).not.toBeNull();
    expect(captured.createPayload!.subtitle).toBe("Estudo de IA aplicada");
  });

  it("a edição pré-preenche o subtítulo existente e o envia no payload", async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog({
      id: 14,
      name: "Pesquisa em IA",
      description: "corpo",
      createdAt: "2026-01-05T12:00:00.000Z",
      createdBy: 9,
      leaderId: null,
      status: "active",
      links: [],
      subtitle: "Estudo de IA aplicada",
    } as never);

    const field = screen.getByLabelText("Subtítulo do projeto") as HTMLInputElement;
    expect(field.value).toBe("Estudo de IA aplicada");

    await user.clear(field);
    await user.type(field, "Novo subtítulo");
    await user.click(screen.getByRole("button", { name: "Atualizar" }));

    expect(captured.updatePayload).not.toBeNull();
    expect(captured.updatePayload!.subtitle).toBe("Novo subtítulo");
  });
});
