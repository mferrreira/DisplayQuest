/**
 * V5-2c — testes de UI dos painéis de entregáveis e anexos do diálogo de projeto.
 *
 * Por que existe: os painéis são a única parte do batch que o `tsc` não cobre, e a lição do
 * V4-5c está registrada — um mock que ignora uma chave do corpo deixa o teste verde provando só
 * que o input existe. Então o substituto de rede aqui CONSUME as funções do domínio
 * (`normalizeDeliverableInput`/`validateDeliverableInput`) e do seam (`validateBlobUpload` +
 * `readFileHead`), em vez de reimplementar a regra (DEC-90). O que se prova é o percurso:
 * painel → cliente → corpo que sai da rota → resposta → tela.
 *
 * Por que a rede é um `fetch` gravador e não MSW (medido ao escrever): o `fetch` que o Vitest
 * injeta no jsdom é o do undici, e ele **não serializa** um `File` do jsdom dentro de um
 * `FormData` — `multipartFormDataParser` falha com
 * `assert(typeof value === "string" && webidl.is.USVString(value) || webidl.is.File(value))`
 * antes de qualquer handler. Um `FormData` inspecionado direto prova inclusive mais que o MSW
 * provaria: o nome do campo (`file`), o nome e o tipo do arquivo. O contrato HTTP em si —
 * multipart de verdade aceito pela rota — está congelado em
 * `tests/unit/api/project-files-routes.test.ts`, que exercita a rota com `NextRequest.formData()`.
 *
 * Costura medida:
 *   - `useToast` é o shim sonner: nenhum texto de toast chega ao DOM sem `<Toaster/>` montado, e
 *     montar o Toaster exige `matchMedia`, que o jsdom desta base não tem. O stub é LOCAL a este
 *     arquivo — um shim global em tests/setup.ts mudaria o caminho "mobile" de todos os testes do
 *     quadro (medido no V4-5a).
 *   - `confirm` não existe no jsdom; os dois painéis confirmam antes de apagar.
 *   - `userEvent` cru é lento sob carga paralela (medido no V4-6b): `setup({ delay: null })`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { ProjectAttachmentsPanel } from "@/components/features/project-attachments-panel";
import { ProjectDeliverablesPanel } from "@/components/features/project-deliverables-panel";
import {
  deliverableValidationMessage,
  normalizeDeliverableInput,
  validateDeliverableInput,
} from "@/backend/domain";
import { validateBlobUpload } from "@/lib/storage/blob-store";
import { readFileHead } from "@/lib/storage/magic-bytes";

interface DeliverableRow {
  id: number;
  projectId: number;
  name: string;
  quantity: number;
  createdAt: string;
}

interface AttachmentRow {
  id: number;
  projectId: number;
  name: string;
  contentType: string;
  size: number;
  uploadedBy: number;
  uploadedAt: string;
}

const mocks = {
  deliverables: [] as DeliverableRow[],
  attachments: [] as AttachmentRow[],
  requests: [] as Array<{ method: string; path: string; json?: Record<string, unknown> }>,
  uploads: [] as Array<{ field: string | null; name: string; type: string; size: number }>,
  refuseDeliverableWrite: false,
  nextId: 500,
};

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function resetStore() {
  mocks.deliverables = [
    { id: 101, projectId: 7, name: "Relatório parcial", quantity: 2, createdAt: "2026-10-01T12:00:00.000Z" },
  ];
  mocks.attachments = [
    {
      id: 201,
      projectId: 7,
      name: "Ata da reunião.pdf",
      contentType: "application/pdf",
      size: 1536,
      uploadedBy: 1,
      uploadedAt: "2026-10-01T12:00:00.000Z",
    },
  ];
  mocks.requests = [];
  mocks.uploads = [];
  mocks.refuseDeliverableWrite = false;
  mocks.nextId = 500;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Substituto de rede na forma das rotas reais (`{ deliverables }`, `{ deliverable }`,
 * `{ attachment }`, `{ error }`), com a validação emprestada do domínio e do seam — é o que
 * impede o substituto de virar uma segunda regra (DEC-90).
 */
async function recordingFetch(input: unknown, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const path = new URL(String(input), "http://localhost:3000").pathname;
  const segments = path.split("/"); // ["", "api", "projects", "7", "deliverables", "101"]
  const resource = segments[4];
  const resourceId = Number(segments[5]);

  if (resource === "deliverables") {
    if (method === "GET") {
      return jsonResponse({ deliverables: mocks.deliverables });
    }
    if (method === "DELETE") {
      mocks.deliverables = mocks.deliverables.filter((row) => row.id !== resourceId);
      return jsonResponse({ deliverable: { id: resourceId } });
    }
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    mocks.requests.push({ method, path, json: body });
    if (mocks.refuseDeliverableWrite) {
      return jsonResponse(
        { error: "Usuário não tem permissão para gerenciar este projeto" },
        403,
      );
    }
    const fields = normalizeDeliverableInput({ name: body.name, quantity: body.quantity });
    const errors = validateDeliverableInput(fields);
    if (errors.length > 0) {
      return jsonResponse({ error: deliverableValidationMessage(errors) }, 400);
    }
    if (method === "POST") {
      const row: DeliverableRow = {
        id: ++mocks.nextId,
        projectId: 7,
        name: fields.name,
        quantity: fields.quantity,
        createdAt: "2026-10-13T12:00:00.000Z",
      };
      mocks.deliverables.push(row);
      return jsonResponse({ deliverable: row }, 201);
    }
    const row = mocks.deliverables.find((item) => item.id === resourceId);
    if (!row) return jsonResponse({ error: "Entregável não encontrado" }, 404);
    row.name = fields.name;
    row.quantity = fields.quantity;
    return jsonResponse({ deliverable: row });
  }

  if (resource === "attachments") {
    if (method === "GET") {
      return jsonResponse({ attachments: mocks.attachments });
    }
    if (method === "DELETE") {
      mocks.attachments = mocks.attachments.filter((row) => row.id !== resourceId);
      return jsonResponse({ attachment: { id: resourceId } });
    }
    const form = init.body as FormData;
    const file = form.get("file");
    mocks.uploads.push({
      field: form.has("file") ? "file" : null,
      name: file instanceof File ? file.name : "",
      type: file instanceof File ? file.type : "",
      size: file instanceof File ? file.size : 0,
    });
    if (!(file instanceof File)) {
      return jsonResponse({ error: "Arquivo é obrigatório" }, 400);
    }
    // Mesma checagem da rota: allowlist + teto + assinatura, pelo seam.
    const validation = validateBlobUpload({
      contentType: file.type,
      size: file.size,
      head: await readFileHead(file),
    });
    if (!validation.ok) {
      return jsonResponse({ error: validation.error }, 400);
    }
    const row: AttachmentRow = {
      id: ++mocks.nextId,
      projectId: 7,
      name: file.name,
      contentType: file.type,
      size: file.size,
      uploadedBy: 1,
      uploadedAt: "2026-10-13T12:00:00.000Z",
    };
    mocks.attachments.push(row);
    return jsonResponse({ attachment: row }, 201);
  }

  throw new Error(`rota não prevista pelo gravador: ${method} ${path}`);
}

function renderPanels(canManage: boolean) {
  return render(
    <>
      <ProjectDeliverablesPanel projectId={7} canManage={canManage} />
      <ProjectAttachmentsPanel projectId={7} canManage={canManage} />
      {/* Sem isto nenhum toast chega ao DOM (medido no V4-5a). */}
      <Toaster />
    </>,
  );
}

beforeEach(() => {
  resetStore();
  vi.stubGlobal("fetch", vi.fn(recordingFetch));
  // O stub de `matchMedia` é local de propósito: um shim global em tests/setup.ts mudaria o
  // caminho "mobile" dos testes do quadro, que hoje dependem de ele NÃO existir.
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
  vi.stubGlobal("confirm", vi.fn<(message?: string) => boolean>(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("painel de entregáveis", () => {
  it("lista o que o projeto entrega, com a quantidade", async () => {
    renderPanels(true);
    expect(await screen.findByText("Relatório parcial")).toBeInTheDocument();
    expect(screen.getByText("2 un.")).toBeInTheDocument();
  });

  it("lista vazia diz isso em palavras", async () => {
    mocks.deliverables = [];
    renderPanels(true);
    expect(await screen.findByText("Nenhum entregável cadastrado.")).toBeInTheDocument();
  });

  it("quem não gerencia vê a lista sem nenhum controle de escrita", async () => {
    renderPanels(false);
    expect(await screen.findByText("Relatório parcial")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar Relatório parcial" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir Relatório parcial" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nome do entregável")).not.toBeInTheDocument();
  });

  it("criar entrega nome e quantidade no corpo e entra na lista sem recarregar", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanels(true);
    await screen.findByText("Relatório parcial");

    await user.type(screen.getByLabelText("Nome do entregável"), "Slides da defesa");
    await user.clear(screen.getByLabelText("Unidades"));
    await user.type(screen.getByLabelText("Unidades"), "3");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(mocks.requests).toHaveLength(1));
    expect(mocks.requests[0]).toMatchObject({
      method: "POST",
      path: "/api/projects/7/deliverables",
      json: { name: "Slides da defesa", quantity: 3 },
    });
    expect(await screen.findByText("Slides da defesa")).toBeInTheDocument();
    expect(screen.getByText("3 un.")).toBeInTheDocument();
  });

  it("quantidade vazia não é enviada como 0: sai ausente e o servidor decide 1", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanels(true);
    await screen.findByText("Relatório parcial");

    await user.type(screen.getByLabelText("Nome do entregável"), "Artigo");
    await user.clear(screen.getByLabelText("Unidades"));
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    await waitFor(() => expect(mocks.requests).toHaveLength(1));
    // `quantity: undefined` não sobrevive ao JSON: a chave sai do corpo, que é o contrato.
    expect(mocks.requests[0].json).toEqual({ name: "Artigo" });
    expect(await screen.findByText("1 un.")).toBeInTheDocument();
  });

  it("403 do servidor vira aviso na tela e a linha NÃO entra na lista", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.refuseDeliverableWrite = true;
    renderPanels(true);
    await screen.findByText("Relatório parcial");

    await user.type(screen.getByLabelText("Nome do entregável"), "Slides");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));

    expect(
      await screen.findByText("Usuário não tem permissão para gerenciar este projeto"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Slides")).not.toBeInTheDocument();
  });

  it("editar muda só a linha editada", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanels(true);
    await screen.findByText("Relatório parcial");

    await user.click(screen.getByRole("button", { name: "Editar Relatório parcial" }));
    await user.clear(screen.getByLabelText("Nova quantidade"));
    await user.type(screen.getByLabelText("Nova quantidade"), "9");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    expect(await screen.findByText("9 un.")).toBeInTheDocument();
    expect(mocks.requests[0]).toMatchObject({
      method: "PUT",
      path: "/api/projects/7/deliverables/101",
      json: { name: "Relatório parcial", quantity: 9 },
    });
  });

  it("excluir confirma, chama DELETE e some da lista", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanels(true);
    await screen.findByText("Relatório parcial");

    await user.click(screen.getByRole("button", { name: "Excluir Relatório parcial" }));

    await waitFor(() => expect(mocks.deliverables).toEqual([]));
    expect(await screen.findByText("Nenhum entregável cadastrado.")).toBeInTheDocument();
  });
});

describe("painel de anexos", () => {
  it("lista o anexo com tamanho legível e link para a rota que serve o arquivo", async () => {
    renderPanels(true);
    const link = await screen.findByRole("link", { name: /Ata da reunião/ });
    expect(link).toHaveAttribute("href", "/api/projects/7/attachments/201/file");
    // 1536 B -> 1,5 KB (vírgula: a tela é pt-BR)
    expect(screen.getByText("1,5 KB")).toBeInTheDocument();
  });

  it("quem não gerencia não vê o campo de arquivo nem o botão de enviar", async () => {
    renderPanels(false);
    expect(await screen.findByRole("link", { name: /Ata da reunião/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Arquivo")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir Ata da reunião.pdf" })).not.toBeInTheDocument();
  });

  it("enviar manda o arquivo no campo `file` e a linha entra no topo", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanels(true);
    await screen.findByRole("link", { name: /Ata da reunião/ });

    await user.upload(
      screen.getByLabelText("Arquivo"),
      new File([PNG_BYTES], "foto do evento.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    await waitFor(() => expect(mocks.uploads).toHaveLength(1));
    expect(mocks.uploads[0]).toEqual({
      field: "file",
      name: "foto do evento.png",
      type: "image/png",
      size: PNG_BYTES.byteLength,
    });
    expect(await screen.findByRole("link", { name: /foto do evento/ })).toBeInTheDocument();
  });

  it("recusa do seam chega como aviso com a frase do seam, e a lista não muda", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanels(true);
    await screen.findByRole("link", { name: /Ata da reunião/ });

    // PNG com o tipo declarado de PDF: a assinatura é conferida pelo seam, como na rota.
    await user.upload(
      screen.getByLabelText("Arquivo"),
      new File([PNG_BYTES], "disfarçado.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(await screen.findByText(/Conteúdo não corresponde ao tipo declarado/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /disfarçado/ })).not.toBeInTheDocument();
  });

  it("excluir anexo remove a linha", async () => {
    const user = userEvent.setup({ delay: null });
    renderPanels(true);
    await screen.findByRole("link", { name: /Ata da reunião/ });

    await user.click(screen.getByRole("button", { name: "Excluir Ata da reunião.pdf" }));

    await waitFor(() => expect(mocks.attachments).toEqual([]));
    expect(await screen.findByText("Nenhum anexo enviado.")).toBeInTheDocument();
  });
});
