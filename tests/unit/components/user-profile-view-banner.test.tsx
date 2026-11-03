/**
 * S04 (R4, DEC-240) — a faixa de capa do perfil de terceiro é 21:9: largura plena da
 * tela, proporção fixa, sem altura em pixels. O aceite congela a classe da faixa com
 * capa e do placeholder, e proíbe altura fixa (`h-<n>`).
 *
 * Harness: o mesmo duplo de `profile-person-data.test.tsx` — `fetchAPI` da leitura de
 * meses do cartão é dobrado (ProfileMonthsList é filho do UserProfileView, DEC-185/plan-v9).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { UserProfileView } from "@/components/ui/user-profile-view";
import type { User } from "@/contexts/types";

const mocks = vi.hoisted(() => ({ fetchAPI: vi.fn() }));

vi.mock("@/contexts/api-client", () => ({
  UserProfilesAPI: { getProfile: vi.fn(), updateProfile: vi.fn() },
  fetchAPI: mocks.fetchAPI,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ update: vi.fn() }),
}));

beforeEach(() => {
  mocks.fetchAPI.mockResolvedValue({
    months: [],
    notice: "Nenhum mês fechado ainda. A lista aparece depois do primeiro fechamento.",
    userId: 7,
    track: "MONTH_POINTS",
  });
});

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

describe("UserProfileView — faixa 21:9 (R4)", () => {
  it("com capa: o contêiner da imagem é aspect-[21/9], sem altura fixa", () => {
    render(<UserProfileView user={me({ bannerKey: "users/7/images/banner" })} onBack={vi.fn()} />);

    const strip = screen.getByRole("img", { name: "Capa de Ana Souza" }).parentElement!;
    expect(strip.className).toContain("aspect-[21/9]");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
  });

  it("sem capa: o placeholder ocupa a mesma faixa 21:9", () => {
    render(<UserProfileView user={me()} onBack={vi.fn()} />);

    const strip = screen.getByText("Sem capa").parentElement!;
    expect(strip.className).toContain("aspect-[21/9]");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
  });
});
