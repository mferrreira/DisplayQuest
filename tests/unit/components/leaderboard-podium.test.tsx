/**
 * S07 (plan-v11, R7) — o pódio do placar dá destaque real ao 2º e ao 3º.
 *
 * Por que existe: os dois chegavam como links soltos, sem cartão; o dono pediu cartão com
 * borda, fundo de card, medalha, avatar e pontos visíveis, mantendo o bloco do campeão e os
 * links ao perfil. O aceite congela: cartão (border + bg-card), medalha/avatar/pontos por
 * linha, href do perfil, e o bloco do campeão intacto ("1º lugar" + coroa + pontos grandes).
 *
 * O componente recebe as entradas do quadro — nenhuma rede, nenhum contexto.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LeaderboardPodium } from "@/components/leaderboard/leaderboard-podium";

const entries = [
  { id: 1, name: "Ana", value: 240, position: 1, avatar: null, bannerKey: null, roles: ["COORDENADOR"] },
  { id: 2, name: "Bruno", value: 180, position: 2, avatar: "/api/uploads/avatars/bruno.webp", bannerKey: null, roles: ["PESQUISADOR"] },
  { id: 3, name: "Carla", value: 120, position: 3, avatar: "/api/uploads/avatars/carla.webp", bannerKey: null, roles: ["VOLUNTARIO"] },
];

describe("LeaderboardPodium — destaque do top 3 (R7)", () => {
  it("o bloco do campeão permanece: '1º lugar', nome e pontos grandes", () => {
    render(<LeaderboardPodium champion={entries[0]} runnersUp={entries.slice(1)} />);
    const champ = screen.getByRole("link", { name: /Ana/ });
    expect(champ).toHaveAttribute("href", "/dashboard/profile?userId=1");
    expect(champ).toHaveTextContent("1º lugar");
    expect(champ).toHaveTextContent("240");
  });

  it("2º e 3º são cartões com borda e fundo de card, com medalha, avatar e pontos", () => {
    render(<LeaderboardPodium champion={entries[0]} runnersUp={entries.slice(1)} />);
    const second = screen.getByRole("link", { name: /Bruno/ });
    expect(second).toHaveAttribute("href", "/dashboard/profile?userId=2");
    expect(second.className).toContain("border");
    expect(second.className).toContain("bg-card");
    expect(second).toHaveTextContent("2º");
    expect(second).toHaveTextContent("180");
    // Radix Avatar no jsdom: o img só monta quando a imagem carrega (nunca no
    // jsdom); o slot do avatar se prova pelo fallback de iniciais.
    expect(second).toHaveTextContent("B");

    const third = screen.getByRole("link", { name: /Carla/ });
    expect(third).toHaveAttribute("href", "/dashboard/profile?userId=3");
    expect(third.className).toContain("border");
    expect(third.className).toContain("bg-card");
    expect(third).toHaveTextContent("3º");
    expect(third).toHaveTextContent("120");
    expect(third).toHaveTextContent("C");
  });

  it("sem 2º/3º: só o bloco do campeão é renderizado", () => {
    render(<LeaderboardPodium champion={entries[0]} runnersUp={[]} />);
    expect(screen.getByRole("link", { name: /Ana/ })).toHaveTextContent("1º lugar");
    expect(screen.queryByRole("link", { name: /Bruno/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Segundo e terceiro lugares" })).toBeNull();
  });
});
