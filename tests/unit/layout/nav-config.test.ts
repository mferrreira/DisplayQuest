import { describe, expect, it } from "vitest";

import { getNavigationGroups, isNavItemActive } from "@/components/layout/nav-config";

/**
 * V6-2 · caracterização do nav-config.ts (RF-V6.3 R1/R2, DEC-112).
 * A sidebar e o menu mobile passam a consumir ESTA estrutura; ela é a fonte única.
 * O teste congela os destinos medidos hoje — nenhum destino novo entra sem decisão
 * (DEC-112 rejeita explicitamente Times/Inventário/Gamificação das referências).
 */

const hrefsFor = (roles: string[]) =>
  getNavigationGroups(roles).flatMap((group) => group.items.map((item) => item.href));

describe("nav-config — destinos congelados (caracterização V6-2)", () => {
  it("COORDENADOR vê os 8 destinos, na ordem da fonte", () => {
    expect(hrefsFor(["COORDENADOR"])).toEqual([
      "/dashboard",
      "/dashboard/projetos",
      "/dashboard/laboratorio",
      "/dashboard/weekly-reports",
      "/dashboard/admin",
      "/dashboard/profile",
      "/dashboard/loja",
      "/dashboard/leaderboard",
    ]);
  });

  it("VOLUNTARIO não vê Relatórios nem Painel Administrativo", () => {
    const hrefs = hrefsFor(["VOLUNTARIO"]);
    expect(hrefs).toContain("/dashboard/projetos"); // VIEW_PROJECT_DASHBOARD inclui VOLUNTARIO
    expect(hrefs).not.toContain("/dashboard/weekly-reports");
    expect(hrefs).not.toContain("/dashboard/admin");
  });

  it("LABORATORISTA vê Relatórios mas não o Painel Administrativo", () => {
    const hrefs = hrefsFor(["LABORATORISTA"]);
    expect(hrefs).toContain("/dashboard/weekly-reports");
    expect(hrefs).not.toContain("/dashboard/admin");
  });

  it("GERENTE_PROJETO vê Projetos mas não Relatórios nem Painel", () => {
    const hrefs = hrefsFor(["GERENTE_PROJETO"]);
    expect(hrefs).toContain("/dashboard/projetos");
    expect(hrefs).not.toContain("/dashboard/weekly-reports");
    expect(hrefs).not.toContain("/dashboard/admin");
  });

  it("os rótulos visíveis são os da fonte, sem destino novo", () => {
    const labels = getNavigationGroups(["COORDENADOR"]).flatMap((group) =>
      group.items.map((item) => item.label),
    );
    expect(labels).toEqual([
      "Quadro de Tarefas",
      "Projetos",
      "Laboratório",
      "Relatórios",
      "Painel Administrativo",
      "Perfil",
      "Loja",
      "Ranking",
    ]);
  });
});

describe("nav-config — item ativo", () => {
  it("Quadro de Tarefas é casamento exato: /dashboard/projetos NÃO ativa /dashboard", () => {
    const board = getNavigationGroups(["COORDENADOR"])
      .flatMap((group) => group.items)
      .find((item) => item.href === "/dashboard")!;
    expect(isNavItemActive(board, "/dashboard")).toBe(true);
    expect(isNavItemActive(board, "/dashboard/projetos")).toBe(false);
  });

  it("itens com matchPrefix ficam ativos na subrota", () => {
    const projetos = getNavigationGroups(["COORDENADOR"])
      .flatMap((group) => group.items)
      .find((item) => item.href === "/dashboard/projetos")!;
    expect(isNavItemActive(projetos, "/dashboard/projetos/42")).toBe(true);
  });
});
