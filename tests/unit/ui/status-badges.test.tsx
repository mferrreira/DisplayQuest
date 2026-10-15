import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Badge } from "@/components/ui/badge";
import { projectStatusBadgeClass, projectStatusLabel } from "@/components/ui/status";

/**
 * V6-1 · status.ts (RF-V6.1/RF-V6.2, AC-V6-06).
 * Um mapa so de status→cor/label para o projeto; classe escrita contra os tokens
 * semanticos (`--success`/`--info`/`--muted`), que o bloco `.dark` de `app/globals.css`
 * redefine — entao nenhuma classe carrega par `dark:` casado a mao, gradiente, nem
 * paleta crua. Os mapas de tarefa/privacidade entram aqui na V6-3 (cartao) e na V6-5
 * (o dialog sai); ate la continuam nos consumidores e este guarda nao os alcanca.
 */
const RAW_PALETTE =
  /(?:bg|text|border|from|via|to)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/;

describe("status.ts — a unica fonte de status→cor/label (V6-1)", () => {
  it("cobre todo status do contrato de Project, com label em pt-BR", () => {
    expect(Object.keys(projectStatusLabel).sort()).toEqual(["active", "archived", "completed"]);
    expect(Object.keys(projectStatusBadgeClass).sort()).toEqual(["active", "archived", "completed"]);
    expect(projectStatusLabel.active).toBe("Ativo");
    expect(projectStatusLabel.completed).toBe("Concluído");
    expect(projectStatusLabel.archived).toBe("Arquivado");
  });

  it("as classes usam os tokens semanticos, sem paleta crua, sem gradiente, sem par dark: a mao", () => {
    for (const [status, classes] of Object.entries(projectStatusBadgeClass)) {
      expect(classes, `status ${status}`).not.toMatch(RAW_PALETTE);
      expect(classes, `status ${status}`).not.toContain("gradient");
      expect(classes, `status ${status}`).not.toContain("dark:");
    }
    expect(projectStatusBadgeClass.active).toContain("success");
    expect(projectStatusBadgeClass.completed).toContain("info");
    expect(projectStatusBadgeClass.archived).toContain("muted");
  });

  it("o Badge monta com a classe e o label do mapa", () => {
    render(
      <Badge className={projectStatusBadgeClass.active}>{projectStatusLabel.active}</Badge>,
    );
    const badge = screen.getByText("Ativo");
    expect(badge.className).toContain("bg-success/15");
    expect(badge.className).toContain("text-success");
  });

  it("as duas copias locais que existiam na base sumiram (AC-V6-06, troca da V6-1)", async () => {
    // O grep da AC e global no fechamento (V6-11); aqui a onda responde pelas duas copias
    // de status do projeto: project-list.tsx e project-detail-dialog.tsx nao definem mais
    // `statusColors`/`statusLabels` proprios.
    const fs = await import("node:fs/promises");
    for (const file of ["components/features/project-list.tsx", "components/ui/project-detail-dialog.tsx"]) {
      const source = await fs.readFile(file, "utf8");
      expect(source, file).not.toMatch(/const status(Colors|Labels)\b/);
      expect(source, file).toContain("@/components/ui/status");
    }
  });
});
