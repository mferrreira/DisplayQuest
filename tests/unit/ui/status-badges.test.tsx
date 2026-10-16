import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Badge } from "@/components/ui/badge";
import {
  projectStatusBadgeClass,
  projectStatusLabel,
  taskPriorityBadgeClass,
  taskPriorityLabel,
  taskStatusBadgeClass,
  taskStatusLabel,
} from "@/components/ui/status";

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
    // de status do projeto: project-list.tsx e a rota dedicada do projeto nao definem mais
    // `statusColors`/`statusLabels` proprios.
    const fs = await import("node:fs/promises");
    for (const file of ["components/features/project-list.tsx", "app/(dashboard)/dashboard/projetos/[id]/page.tsx"]) {
      const source = await fs.readFile(file, "utf8");
      expect(source, file).not.toMatch(/const status(Colors|Labels)\b/);
      expect(source, file).toContain("@/components/ui/status");
    }
  });
});

/**
 * V6-3 · os mapas de TAREFA entram na unica fonte (RF-V6.2 R2 — "as do cartao migram na
 * V6-3") e o quadro passa no grep de AC-V6-12: zero `gradient`, zero emoji decorativo em
 * `board-column`/`task-card`, com os seletores travados da §2.7 ainda presentes.
 *
 * Emoji em LINHA de toast esta FORA da contagem de proposito: as frases do toast do quadro
 * sao travadas pela TRAVA da onda ("nenhum toast do quadro muda") — o emoji la dentro e
 * string congelada por teste, nao decoracao de interface. O que o grep caça é o emoji que
 * virou icone (🕐✏️👁️⚠️✅ nas colunas, ⚡🌍 no cartao).
 */
const TASK_STATUSES = ["to-do", "in-progress", "in-review", "adjust", "done"] as const;
const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

// U+1F000.. (🕐👁️🌍📋🎉), U+2600..27BF (⚠️✏️✅⚡), U+2B00.. e variacao FE0F.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
// As frases do toast do quadro sao travadas pela TRAVA da onda ("nenhum toast do quadro
// muda"); o emoji la dentro e string congelada por teste, nao decoracao de interface. O
// grep caça o emoji que virou icone (nas colunas e no cartao), nao esses titulos.
const LOCKED_TOAST_TITLES = ["Tarefa Concluída!", "Tarefa Enviada para Revisão"];

describe("status.ts — mapas de tarefa/privacidade (V6-3)", () => {
  it("cobre todo status e toda prioridade do contrato de Task, com label em pt-BR", () => {
    expect(Object.keys(taskStatusLabel).sort()).toEqual([...TASK_STATUSES].sort());
    expect(Object.keys(taskStatusBadgeClass).sort()).toEqual([...TASK_STATUSES].sort());
    expect(Object.keys(taskPriorityLabel).sort()).toEqual([...TASK_PRIORITIES].sort());
    expect(Object.keys(taskPriorityBadgeClass).sort()).toEqual([...TASK_PRIORITIES].sort());
    // Os textos visíveis existentes ficam congelados (RF-V6.10 R4); só o tratamento
    // visual dos badges muda nesta onda.
    expect(taskStatusLabel["to-do"]).toBe("A FAZER");
    expect(taskStatusLabel.done).toBe("CONCLUÍDA");
    expect(taskPriorityLabel.urgent).toBe("URGENTE");
  });

  it("as classes de tarefa usam tokens semanticos — sem paleta crua, sem gradiente, sem dark: a mao", () => {
    for (const classes of [...Object.values(taskStatusBadgeClass), ...Object.values(taskPriorityBadgeClass)]) {
      expect(classes).not.toMatch(RAW_PALETTE);
      expect(classes).not.toContain("gradient");
      expect(classes).not.toContain("dark:");
    }
    // Em Revisao e roxo (design-system: "purple — review-related information"); sem token
    // proprio na base, nasceu --review em globals.css — nunca uma copia de purple-500.
    expect(taskStatusBadgeClass["in-review"]).toContain("review");
    expect(taskStatusBadgeClass["in-progress"]).toContain("info");
    expect(taskStatusBadgeClass.done).toContain("success");
    expect(taskStatusBadgeClass.adjust).toContain("warning");
    expect(taskPriorityBadgeClass.urgent).toContain("destructive");
  });

  it("board-column e task-card: zero gradient, zero emoji decorativo (AC-V6-12)", async () => {
    const fs = await import("node:fs/promises");
    const column = await fs.readFile("features/tasks/components/board-column.tsx", "utf8");
    expect(column).toContain('"to-do": { header: "bg-muted text-muted-foreground"');
    expect(column).toContain('"in-progress": { header: "bg-info/10 text-info"');
    expect(column).toContain('"in-review": { header: "bg-review/10 text-review"');
    expect(column).toContain('adjust: { header: "bg-warning/10 text-warning"');
    expect(column).toContain('done: { header: "bg-success/10 text-success"');

    for (const [file, source] of [
      ["features/tasks/components/board-column.tsx", column],
      ["features/tasks/components/task-card.tsx", await fs.readFile("features/tasks/components/task-card.tsx", "utf8")],
    ] as const) {
      expect(source, file).not.toContain("gradient");
      const semToast = source
        .split("\n")
        .filter(
          (line) =>
            !line.includes("toast") && !LOCKED_TOAST_TITLES.some((titulo) => line.includes(titulo)),
        )
        .join("\n");
      expect(semToast, `${file} tem emoji decorativo`).not.toMatch(EMOJI);
    }
  });

  it("os seletores travados da §2.7 continuam nas duas fontes do quadro (AC-V6-12)", async () => {
    const fs = await import("node:fs/promises");
    const column = await fs.readFile("features/tasks/components/board-column.tsx", "utf8");
    const card = await fs.readFile("features/tasks/components/task-card.tsx", "utf8");
    for (const fragment of [
      "aria-label={`Coluna ${title}`}",
      "aria-label={`Ordenar tarefas de ${title}`}",
      "aria-label={`Adicionar tarefa em ${title}`}",
      "<h2",
    ]) {
      expect(column, `board-column perdeu "${fragment}"`).toContain(fragment);
    }
    for (const fragment of [
      "aria-label={`Ações para ${task.title}`}",
      "aria-label={`Arrastar tarefa ${task.title}`}",
      "aria-label={`Ver detalhes de ${task.title}`}",
      "aria-label={`Progresso de ${task.title}",
      "aria-label={`Concluir subtask ${subtask.title}`}",
      'aria-label="Aprovar tarefa"',
      'aria-label="Rejeitar tarefa"',
    ]) {
      expect(card, `task-card perdeu "${fragment}"`).toContain(fragment);
    }
  });

  it("as duas copias locais do cartao sumiram (unica fonte — DEC-111)", async () => {
    const fs = await import("node:fs/promises");
    const card = await fs.readFile("features/tasks/components/task-card.tsx", "utf8");
    expect(card).not.toMatch(/const (STATUS_LABEL|PRIORITY_LABEL)\b/);
    expect(card).not.toMatch(/function (statusBadgeClass|priorityBadgeClass)\b/);
    expect(card).toContain("@/components/ui/status");
  });
});
