import { describe, expect, it } from "vitest";

import { FEATURE_ACCESS, PERMISSIONS } from "@/backend/domain/identity/permissions";

/**
 * V6-2 · AC-V6-34 (RF-V6.16 R4) — as chaves de navegação resolvidas na matriz.
 *
 *  - `DASHBOARD_PROJETOS` era chave MORTA (0 consumidores) — saiu.
 *  - `MANAGE_REWARDS` vivia em DUAS matrizes com o mesmo valor — fica só em `PERMISSIONS`
 *    (a autoridade backend); a UI que gerencia recompensas fala a permissão, não uma cópia.
 *  - `DASHBOARD_VOLUNTEERS` nasce com o valor medido do `showVolunteers` da página de
 *    projetos (GERENTE_PROJETO ∪ hasGodMode = COORDENADOR/GERENTE).
 *  - `DASHBOARD_PROJECT_MANAGER` nasce pela DEC-186 (o `showDashboard = ['GERENTE_PROJETO']`
 *    era bug): união ["COORDENADOR","GERENTE","GERENTE_PROJETO"] — a ÚNICA exceção
 *    registrada à regra "nenhum conjunto de papéis muda de valor" (RF-V6.16 R1).
 *  - A página e o nav de Relatórios passam a falar a MESMA chave (`VIEW_WEEKLY_REPORTS`,
 *    que já governava o guard da página e o fetch do weekly-report-context); a chave gêmea
 *    `DASHBOARD_WEEKLY_REPORTS` (só o nav consumia) saiu — é o par duplicado que a R4 manda
 *    resolver. O valor não mudou: os dois conjuntos eram idênticos.
 *
 * O consumo das chaves novas troca em V6-4 (aba Dashboard) e V6-9 (aba Voluntários no
 * Painel); aqui elas nascem porque `nav-config.ts` é a fonte única da navegação.
 */

const feature = FEATURE_ACCESS as Record<string, readonly string[] | undefined>;
const permission = PERMISSIONS as Record<string, readonly string[] | undefined>;

describe("chaves de navegação — matriz única (AC-V6-34)", () => {
  it("DASHBOARD_PROJETOS (chave morta) saiu da matriz", () => {
    expect(feature.DASHBOARD_PROJETOS).toBeUndefined();
  });

  it("MANAGE_REWARDS vive em UMA matriz só: a autoridade backend", () => {
    expect(permission.MANAGE_REWARDS).toEqual(["COORDENADOR", "GERENTE", "LABORATORISTA"]);
    expect(feature.MANAGE_REWARDS).toBeUndefined();
  });

  it("DASHBOARD_WEEKLY_REPORTS (gêmea de VIEW_WEEKLY_REPORTS) saiu", () => {
    expect(feature.DASHBOARD_WEEKLY_REPORTS).toBeUndefined();
  });

  it("DASHBOARD_VOLUNTEERS nasce com o valor medido do showVolunteers", () => {
    expect(feature.DASHBOARD_VOLUNTEERS).toEqual(["COORDENADOR", "GERENTE", "GERENTE_PROJETO"]);
  });

  it("DASHBOARD_PROJECT_MANAGER nasce pela DEC-186 (união, não o valor medido)", () => {
    expect(feature.DASHBOARD_PROJECT_MANAGER).toEqual(["COORDENADOR", "GERENTE", "GERENTE_PROJETO"]);
  });

  it("página e nav de Relatórios falam a mesma chave na fonte", async () => {
    const fs = await import("node:fs/promises");
    const nav = await fs.readFile("components/layout/nav-config.ts", "utf8");
    const page = await fs.readFile("app/(dashboard)/dashboard/weekly-reports/page.tsx", "utf8");
    expect(nav).toContain('feature: "VIEW_WEEKLY_REPORTS"');
    expect(nav).not.toContain("DASHBOARD_WEEKLY_REPORTS");
    expect(page).toContain("VIEW_WEEKLY_REPORTS");
  });
});
