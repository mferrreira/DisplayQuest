/**
 * plan-v16 S04 (R6) — ícone do badge nas telas.
 *
 *  - cartão do admin: `<img>` do arquivo quando há chave, nada quando não há;
 *  - envio: o input de arquivo de cada cartão chama `uploadIcon(id, file)` e recarrega a
 *    lista no sucesso; a recusa do servidor (403) aparece como alerta na tela;
 *  - chips do perfil: imagem quando há chave, o ícone de categoria como fallback quando não.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({
  getAll: vi.fn(),
  uploadIcon: vi.fn(),
  getUserBadges: vi.fn(),
}));

vi.mock("@/contexts/api-client", () => ({ BadgesAPI: api }));

import { BadgeManager } from "@/components/admin/badge-manager";
import { UserBadges } from "@/components/ui/user-badges";

function badgeRow(id: number, iconKey: string | null) {
  return {
    id,
    name: `Selo ${id}`,
    description: "desc",
    icon: "trophy",
    color: "#f59e0b",
    category: "achievement",
    criteria: null,
    iconKey,
    isActive: true,
    createdBy: 1,
  };
}

beforeEach(() => {
  api.getAll.mockReset();
  api.getAll.mockResolvedValue({ badges: [badgeRow(3, "badges/3/x.webp"), badgeRow(4, null)] });
  api.uploadIcon.mockReset();
  api.getUserBadges.mockReset();
});

describe("cartões do Painel Administrativo", () => {
  it("cartão com chave mostra o img do arquivo; cartão sem chave não mostra", async () => {
    render(<BadgeManager />);
    await screen.findByText("Gerenciar Badges");
    const img = await screen.findByRole("img", { name: "Ícone do Selo 3" });
    expect(img.getAttribute("src")).toContain("/api/badges/3/icon/file");
    expect(img.getAttribute("src")).toContain("v=badges%2F3%2Fx.webp");
    expect(screen.queryByRole("img", { name: "Ícone do Selo 4" })).toBeNull();
  });

  it("enviar arquivo pelo input do cartão chama a rota e recarrega a lista", async () => {
    api.uploadIcon.mockResolvedValue({ success: true, iconKey: "badges/3/novo.webp", badge: badgeRow(3, "badges/3/novo.webp") });
    render(<BadgeManager />);
    const input = await screen.findByLabelText("Enviar ícone do Selo 3");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(64)], "icon.png", { type: "image/png" })] } });
    await waitFor(() => expect(api.uploadIcon).toHaveBeenCalledWith(3, expect.any(File)));
    await waitFor(() => expect(api.getAll.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("recusa do servidor chega como alerta na tela", async () => {
    api.uploadIcon.mockRejectedValue(new Error("Sem permissão para atualizar badges"));
    render(<BadgeManager />);
    const input = await screen.findByLabelText("Enviar ícone do Selo 3");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(64)], "icon.png", { type: "image/png" })] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão para atualizar badges");
  });
});

describe("chips do perfil", () => {
  it("badge conquistado com chave mostra o img; sem chave usa o fallback sem img", async () => {
    api.getUserBadges.mockResolvedValue({
      badges: [
        { id: 1, userId: 5, badgeId: 3, earnedAt: "2026-11-01", badge: badgeRow(3, "badges/3/x.webp") },
        { id: 2, userId: 5, badgeId: 4, earnedAt: "2026-11-02", badge: badgeRow(4, null) },
      ],
      recentBadges: [],
      count: 2,
      progress: [],
    });
    render(<UserBadges userId={5} limit={8} />);
    const img = await screen.findByRole("img", { name: "Ícone do Selo 3" });
    expect(img.getAttribute("src")).toContain("/api/badges/3/icon/file");
    expect(screen.queryByRole("img", { name: "Ícone do Selo 4" })).toBeNull();
    expect(screen.getByText("Selo 4")).toBeInTheDocument();
    expect(screen.getByText("Selo 3")).toBeInTheDocument();
  });
});
