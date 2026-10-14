/**
 * V5-9/V5-9b (DEC-70/139/167/168) — testes de UI do painel de relatórios técnicos.
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
  denyNextGenerate: false,
  aiFails: false,
}));

const NO_MEMBERS_MESSAGE = "O projeto não tem membros ativos — o relatório é gerado um documento por membro";

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

  if (method === "POST" && path.includes("/generate")) {
    if (mocks.denyNextGenerate) {
      return Promise.resolve(new Response(JSON.stringify({ error: NO_MEMBERS_MESSAGE }), { status: 409 }));
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          files: [
            {
              userId: 9,
              memberName: "Bento Lima",
              key: "projects/7/technical-reports/1/9.docx",
              fileName: "relatorio-parcial-bento-lima.docx",
            },
          ],
        }),
        { status: 201 },
      ),
    );
  }

  if (method === "POST" && path.includes("/draft")) {
    if (mocks.aiFails) {
      return Promise.resolve(new Response(JSON.stringify({ error: "IA indisponível: HTTP 503" }), { status: 502 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify({ draft: "Descrição das Atividades\nRascunho gerado pela IA." }), { status: 200 }),
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
  mocks.denyNextGenerate = false;
  mocks.aiFails = false;
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

  it("V5-9b: 'Gerar DOCX' chama a rota de geração e o download por membro aparece", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel(true);

    await user.click(await screen.findByRole("button", { name: "Gerar documentos do relatório Parcial" }));

    await waitFor(() => {
      const post = mocks.requests.find((r) => r.method === "POST");
      expect(post?.path).toBe(`/api/projects/${PROJECT}/technical-reports/parcial/generate`);
    });
    expect(await screen.findByText("1 arquivo(s) — um por membro ativo do projeto.")).toBeInTheDocument();

    const link = await screen.findByRole("link", { name: "Bento Lima" });
    expect(link).toHaveAttribute(
      "href",
      `/api/projects/${PROJECT}/technical-reports/1/file?userId=9`,
    );
    expect(link).toHaveAttribute("download", "relatorio-parcial-bento-lima.docx");
    // DEC-180: editor igual ao texto salvo → nenhuma PUT redundante.
    expect(mocks.requests.some((r) => r.method === "PUT")).toBe(false);
  });

  it("DEC-180: 'Gerar DOCX' salva o texto em edição ANTES de gerar — o documento sai do que a pessoa vê", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel(true);

    // "Final" não tem linha salva no fixture: o texto digitado só existia no editor.
    const textarea = await screen.findByLabelText("Texto do relatório Final");
    await user.type(textarea, "Texto novo do final.");
    await user.click(screen.getByRole("button", { name: "Gerar documentos do relatório Final" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Bento Lima" })).toBeInTheDocument();
    });
    const put = mocks.requests.find((r) => r.method === "PUT");
    const post = mocks.requests.find((r) => r.method === "POST" && r.path.includes("/generate"));
    expect(put?.body).toEqual({ type: "final", content: "Texto novo do final." });
    expect(post?.path).toBe(`/api/projects/${PROJECT}/technical-reports/final/generate`);
    // A ordem é o contrato: o servidor lê o conteúdo SALVO — a PUT tem que sair antes.
    expect(mocks.requests.indexOf(put!)).toBeLessThan(mocks.requests.indexOf(post!));
  });

  it("DEC-173/180: sem texto salvo o botão de gerar está HABILITADO — editor vazio e sem linha gera sem PUT", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel(true);

    // "Final" não tem linha salva no fixture — e isso não desabilita mais nada.
    expect(await screen.findByRole("button", { name: "Gerar documentos do relatório Final" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Gerar documentos do relatório Parcial" })).toBeEnabled();

    // Editor vazio == nada salvo: não há o que salvar — o documento sai pré-preenchido.
    await user.click(screen.getByRole("button", { name: "Gerar documentos do relatório Final" }));
    await waitFor(() => {
      expect(mocks.requests.some((r) => r.method === "POST" && r.path.includes("/final/generate"))).toBe(true);
    });
    expect(mocks.requests.some((r) => r.method === "PUT")).toBe(false);
  });

  it("V5-9b: o 409 do servidor chega na tela com a frase do use case", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.denyNextGenerate = true;
    renderPanel(true);

    await user.click(await screen.findByRole("button", { name: "Gerar documentos do relatório Parcial" }));

    expect(await screen.findByText(NO_MEMBERS_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bento Lima" })).not.toBeInTheDocument();
  });

  it("V5-9b: sem gestão não há botão de gerar", async () => {
    renderPanel(false);

    expect(await screen.findByDisplayValue("Texto parcial salvo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /gerar documentos/i })).not.toBeInTheDocument();
  });

  it("V5-9c: 'Rascunhar com IA' chama a rota e aplica o texto no editor sem salvar", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel(true);

    await user.click(await screen.findByRole("button", { name: "Rascunhar relatório Parcial com IA" }));

    await waitFor(() => {
      const post = mocks.requests.find((r) => r.method === "POST" && r.path.includes("/draft"));
      expect(post?.path).toBe(`/api/projects/${PROJECT}/technical-reports/parcial/draft`);
    });
    // O texto da IA entra na textarea (o conteúdo atual era o salvo, então é aplicável)...
    // `toHaveValue` lê o valor cru: o normalizador do findByDisplayValue colapsa o \n.
    const textarea = await screen.findByLabelText("Texto do relatório Parcial");
    await waitFor(() => expect(textarea).toHaveValue("Descrição das Atividades\nRascunho gerado pela IA."));
    // ...e o aviso diz que nada foi salvo — salvar é decisão humana.
    expect(await screen.findByText("Revise o texto — nada foi salvo até você clicar em Salvar.")).toBeInTheDocument();
    // Nenhuma PUT saiu.
    expect(mocks.requests.some((r) => r.method === "PUT")).toBe(false);
  });

  it("V5-9c: edição em andamento não é atropelada — o rascunho não é aplicado e o texto fica", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanel(true);

    const textarea = await screen.findByLabelText("Texto do relatório Técnico-final");
    await user.type(textarea, "Meu texto em edição");

    await user.click(screen.getByRole("button", { name: "Rascunhar relatório Técnico-final com IA" }));

    expect(await screen.findByText("O texto em edição não foi sobrescrito — salve ou limpe antes de rascunhar.")).toBeInTheDocument();
    expect(textarea).toHaveValue("Meu texto em edição");
  });

  it("V5-9c: a falha 502 da IA chega na tela com a frase do servidor", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.aiFails = true;
    renderPanel(true);

    await user.click(await screen.findByRole("button", { name: "Rascunhar relatório Parcial com IA" }));

    expect(await screen.findByText("IA indisponível: HTTP 503")).toBeInTheDocument();
    // O texto salvo continua no editor.
    expect(screen.getByDisplayValue("Texto parcial salvo")).toBeInTheDocument();
  });

  it("V5-9c: sem gestão não há botão de rascunhar", async () => {
    renderPanel(false);

    expect(await screen.findByDisplayValue("Texto parcial salvo")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /rascunhar/i })).not.toBeInTheDocument();
  });
});
