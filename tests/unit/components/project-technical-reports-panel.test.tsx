/**
 * V5-9 (DEC-70/139/167) — testes de UI do painel de relatórios técnicos.
 *
 * O painel é a parte do batch que o `tsc` não cobre. A rede é um `fetch` gravador (mesma
 * razão medida no V5-2c) — o corpo gravado prova exatamente o que sai para a rota.
 *
 * Costuras medidas da casa:
 *   - `useToast` só chega ao DOM com `<Toaster/>` montado, e montar o Toaster exige
 *     `matchMedia`, que o jsdom desta base não tem — stub LOCAL (V4-5a/V5-6).
 *   - `userEvent` cru é lento sob carga paralela: `setup({ delay: null })` (V4-6b).
 *   - O erro que a tela mostra é a frase do servidor, não uma cópia (DEC-90): o 403 do
 *     fake carrega a MESMA mensagem congelada no use case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { ProjectTechnicalReportsPanel } from "@/components/features/project-technical-reports-panel";

const PROJECT = 7;
const DENIED_MESSAGE = "Usuário não tem permissão para editar o relatório técnico deste projeto";

interface ReportRow {
  id: number;
  projectId: number;
  type: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

const mocks = vi.hoisted(() => ({
  rows: [] as ReportRow[],
  requests: [] as { method: string; path: string; body?: unknown }[],
  denyNextPut: false,
}));

function recordingFetch(input: RequestInfo | URL, init?: RequestInit) {
  const path = String(input);
  const method = init?.method ?? "GET";
  mocks.requests.push({
    method,
    path,
    body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
  });

  if (method === "GET") {
    return Promise.resolve(
      new Response(JSON.stringify({ reports: mocks.rows }), { status: 200 }),
    );
  }

  if (mocks.denyNextPut) {
    return Promise.resolve(new Response(JSON.stringify({ error: DENIED_MESSAGE }), { status: 403 }));
  }

  const body = JSON.parse(String(init?.body)) as { type: string; content: string };
  const existing = mocks.rows.find((row) => row.type === body.type);
  const saved: ReportRow = existing
    ? { ...existing, content: body.content }
    : {
        id: mocks.rows.length + 1,
        projectId: PROJECT,
        type: body.type,
        content: body.content,
        createdAt: "2026-10-14T12:00:00.000Z",
        updatedAt: "2026-10-14T12:00:00.000Z",
      };
  if (!existing) mocks.rows.push(saved);
  return Promise.resolve(new Response(JSON.stringify({ report: saved }), { status: 200 }));
}

function renderPanel(canManage: boolean) {
  return render(
    <>
      <ProjectTechnicalReportsPanel projectId={PROJECT} canManage={canManage} />
      {/* Sem isto nenhum toast chega ao DOM (medido no V4-5a). */}
      <Toaster />
    </>,
  );
}

beforeEach(() => {
  mocks.rows = [
    {
      id: 1,
      projectId: PROJECT,
      type: "parcial",
      content: "Texto parcial salvo",
      createdAt: "2026-10-14T12:00:00.000Z",
      updatedAt: "2026-10-14T12:00:00.000Z",
    },
  ];
  mocks.requests = [];
  mocks.denyNextPut = false;
  vi.stubGlobal("fetch", vi.fn(recordingFetch));
  // Stub LOCAL: shim global em tests/setup.ts mudaria o caminho "mobile" de outros testes.
  vi.stubGlobal(
    "matchMedia",
    vi.fn<(query: string) => MediaQueryList>((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("painel de relatórios técnicos (V5-9, DEC-70/139)", () => {
  it("os três tipos aparecem na ordem do domínio, com o texto salvo carregado", async () => {
    renderPanel(true);

    expect(await screen.findByText("Relatório Parcial")).toBeInTheDocument();
    expect(screen.getByText("Relatório Técnico-final")).toBeInTheDocument();
    expect(screen.getByText("Relatório Final")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Texto parcial salvo")).toBeInTheDocument();

    const get = mocks.requests.find((r) => r.method === "GET");
    expect(get?.path).toContain(`/api/projects/${PROJECT}/technical-reports`);
  });

  it("sem gestão: nenhum botão de salvar, e o texto não é editável", async () => {
    renderPanel(false);

    expect(await screen.findByDisplayValue("Texto parcial salvo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^salvar/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Texto do relatório Parcial")).toBeDisabled();
  });

  it("gestão digita e salva: o corpo do PUT é o par (tipo, conteúdo) e o aviso chega", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel(true);

    const textarea = await screen.findByLabelText("Texto do relatório Técnico-final");
    await user.type(textarea, "Primeira versão do técnico-final");
    await user.click(screen.getByRole("button", { name: "Salvar relatório Técnico-final" }));

    await waitFor(() => {
      const put = mocks.requests.find((r) => r.method === "PUT");
      expect(put?.body).toEqual({ type: "tecnico-final", content: "Primeira versão do técnico-final" });
    });
    expect(await screen.findByText("Texto do relatório Técnico-final atualizado.")).toBeInTheDocument();
  });

  it("o 403 do servidor chega na tela com a frase do use case (DEC-90)", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.denyNextPut = true;
    renderPanel(true);

    const textarea = await screen.findByLabelText("Texto do relatório Final");
    await user.type(textarea, "tentativa");
    await user.click(screen.getByRole("button", { name: "Salvar relatório Final" }));

    expect(await screen.findByText(DENIED_MESSAGE)).toBeInTheDocument();
  });
});
