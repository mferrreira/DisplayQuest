/**
 * plan-v22 (R5, DEC-265) — o campo "SE BOLSISTA" na tela onde a pessoa escreve os próprios
 * dados (`components/forms/user-profile-form.tsx`).
 *
 * O que estes testes fixam:
 *   1. O campo nasce com o valor gravado e é aparado no submit.
 *   2. O submit manda só o que mudou (padrão V5-4a).
 *   3. Abrir e salvar sem mexer não envia seBolsista.
 *
 * Costura: os mesmos duplos de `profile-person-data.test.tsx` — `UserProfilesAPI` e
 * `useSession` dobrados; o formulário e os inputs do Radix são os reais.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserProfileForm } from "@/components/forms/user-profile-form";
import type { User } from "@/contexts/types";

const mocks = vi.hoisted(() => ({
  updateSession: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/contexts/api-client", () => ({
  UserProfilesAPI: {
    getProfile: mocks.getProfile,
    updateProfile: mocks.updateProfile,
  },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: mocks.updateSession }),
}));

const me = (overrides: Partial<User> = {}): User => ({
  id: 7,
  name: "Ana Souza",
  email: "ana@lab.com",
  points: 10,
  completedTasks: 1,
  status: "active",
  weekHours: 10,
  currentWeekHours: 0,
  profileVisibility: "public",
  bio: null,
  avatar: null,
  roles: ["VOLUNTARIO"],
  createdAt: new Date("2026-10-01T12:00:00.000Z"),
  ...overrides,
});

beforeEach(() => {
  mocks.updateSession.mockReset();
  mocks.getProfile.mockReset();
  mocks.updateProfile.mockReset();
  mocks.getProfile.mockResolvedValue({ user: {} });
  mocks.updateProfile.mockResolvedValue({ user: {} });
});

function field() {
  return screen.getByLabelText("SE BOLSISTA") as HTMLInputElement;
}

describe("o campo SE BOLSISTA na tela de dados do documento", () => {
  it("o campo nasce com o valor gravado", () => {
    render(<UserProfileForm user={me({ seBolsista: "BAT-DI-SUP" })} onUpdate={vi.fn()} onCancel={vi.fn()} />);

    expect(field().value).toBe("BAT-DI-SUP");
  });

  it("sem dado gravado o campo nasce vazio", () => {
    render(<UserProfileForm user={me()} onUpdate={vi.fn()} onCancel={vi.fn()} />);

    expect(field().value).toBe("");
  });

  it("mudar e salvar manda só seBolsista — quem apara é o servidor (normalizePersonText)", async () => {
    const user = me({ seBolsista: "BAT-DI-SUP" });
    render(<UserProfileForm user={user} onUpdate={vi.fn()} onCancel={vi.fn()} />);

    await userEvent.clear(field());
    await userEvent.type(field(), " BAT-EXTSA ");
    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() =>
      expect(mocks.updateProfile).toHaveBeenCalledWith(7, { seBolsista: " BAT-EXTSA " }),
    );
  });

  it("abrir e salvar sem mexer não envia seBolsista", async () => {
    render(<UserProfileForm user={me({ seBolsista: "BAT-DI-SUP" })} onUpdate={vi.fn()} onCancel={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Salvar Alterações" }));

    await waitFor(() => expect(mocks.updateProfile).toHaveBeenCalled());
    expect(mocks.updateProfile.mock.calls[0][1]).not.toHaveProperty("seBolsista");
  });
});
