/**
 * V5-3 (DEC-137) — teste de UI do cabeçalho de mídia do perfil.
 *
 * Por que existe: o cabeçalho e as duas telas que o consomem são a parte do batch que o `tsc` não
 * cobre. A rede é um `fetch` gravador e não MSW pela razão medida no V5-2c: o `fetch` do undici que o
 * Vitest injeta no jsdom não serializa um `File` do jsdom dentro de um `FormData`. Inspecionar o
 * `FormData` direto prova o campo (`file`), o nome e o tipo do arquivo. O multipart de verdade está
 * congelado em `tests/unit/api/user-image-routes.test.ts`.
 *
 * O substituto de rede CONSUME as funções do seam (`isImageBlobContentType`, `validateBlobUpload`,
 * `readFileHead`) em vez de reimplementar a regra (DEC-90), e responde no formato das rotas
 * (`{ user }`, `{ error }`).
 *
 * Costura medida (as mesmas do arquivo irmão):
 *   - nenhum texto de toast chega ao DOM sem `<Toaster/>` montado, e montá-lo exige `matchMedia`,
 *     que o jsdom desta base não tem — o stub é LOCAL a este arquivo.
 *   - `confirm` não existe no jsdom.
 *   - `userEvent` cru é lento sob carga paralela: `setup({ delay: null })`.
 *   - `user.upload` respeita o `accept` do input e descarta em silêncio o arquivo fora da lista.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { UserMediaHeader } from "@/components/features/user-media-header";
import { isImageBlobContentType, validateBlobUpload } from "@/lib/storage/blob-store";
import { readFileHead } from "@/lib/storage/magic-bytes";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const mocks = {
  user: { bannerKey: null as string | null },
  uploads: [] as Array<{ field: string | null; name: string; type: string; size: number }>,
  requests: [] as Array<{ method: string; path: string }>,
  nextId: 0,
};

function resetStore() {
  mocks.user = { bannerKey: null };
  mocks.uploads = [];
  mocks.requests = [];
  mocks.nextId = 0;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Substituto na forma da rota real: `PUT`/`DELETE /api/users/<id>/images/<slot>` → `{ user }`. */
async function recordingFetch(input: unknown, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const path = new URL(String(input), "http://localhost:3000").pathname;
  mocks.requests.push({ method, path });

  const segments = path.split("/"); // ["", "api", "users", "7", "images", "banner"]
  const slot = segments[5] === "banner" ? segments[5] : null;
  if (segments[4] !== "images" || !slot) {
    throw new Error(`rota não prevista pelo gravador: ${method} ${path}`);
  }

  if (method === "DELETE") {
    mocks.user.bannerKey = null;
    return jsonResponse({ user: { ...mocks.user } });
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

  // Mesmas duas checagens da rota: só imagem, e assinatura conferida pelo seam.
  if (!isImageBlobContentType(file.type)) {
    return jsonResponse(
      { error: `Tipo de arquivo não permitido para imagem de perfil: ${file.type || "desconhecido"}` },
      400,
    );
  }
  const validation = validateBlobUpload({
    contentType: file.type,
    size: file.size,
    head: await readFileHead(file),
  });
  if (!validation.ok) {
    return jsonResponse({ error: validation.error }, 400);
  }

  mocks.user.bannerKey = `users/7/images/banner/novo-${++mocks.nextId}.png`;
  return jsonResponse({ user: { ...mocks.user } }, 200);
}

function renderHeader(
  canEdit: boolean,
  bannerKey: string | null = null,
  onBannerChange = vi.fn(),
) {
  return render(
    <>
      <UserMediaHeader
        userId={7}
        userName="Ana Souza"
        bannerKey={bannerKey}
        canEdit={canEdit}
        onBannerChange={onBannerChange}
      />
      {/* Sem isto nenhum toast chega ao DOM (medido no V4-5a). */}
      <Toaster />
    </>,
  );
}

beforeEach(() => {
  resetStore();
  vi.stubGlobal("fetch", vi.fn(recordingFetch));
  // Stub LOCAL: um shim global em tests/setup.ts mudaria o caminho "mobile" de todos os testes do
  // quadro, que hoje caem nele justamente porque não há `matchMedia`.
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cabeçalho de mídia do perfil", () => {
  it("sem capa, a tela diz isso em palavras", () => {
    renderHeader(true);
    expect(screen.getByText("Sem capa")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Capa de Ana Souza" })).not.toBeInTheDocument();
    // O tirar capa só existe quando há capa para tirar.
    expect(screen.queryByRole("button", { name: "Tirar capa" })).not.toBeInTheDocument();
  });

  it("quem não é a pessoa vê a capa sem nenhum controle", async () => {
    mocks.user.bannerKey = "users/7/images/banner/velha.png";
    renderHeader(false, mocks.user.bannerKey);

    const image = await screen.findByRole("img", { name: "Capa de Ana Souza" });
    expect(image).toHaveAttribute(
      "src",
      expect.stringContaining("/api/users/7/images/banner/file"),
    );
    // A chave entra no endereço: sem isto o navegador serviria a capa velha depois de trocar.
    expect(image).toHaveAttribute("src", expect.stringContaining("velha.png"));
    expect(screen.queryByRole("button", { name: "Enviar capa" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tirar capa" })).not.toBeInTheDocument();
  });

  it("subir a capa escreve no slot banner, mostra o binário e sobe a chave para a página", async () => {
    const user = userEvent.setup({ delay: null });
    const onBannerChange = vi.fn();
    renderHeader(true, null, onBannerChange);

    await user.upload(
      screen.getByLabelText("Imagem de capa do perfil"),
      new File([PNG_BYTES], "capa do laboratório.png", { type: "image/png" }),
    );

    await waitFor(() => expect(mocks.uploads).toHaveLength(1));
    expect(mocks.uploads[0]).toMatchObject({
      field: "file",
      name: "capa do laboratório.png",
      type: "image/png",
    });
    expect(mocks.requests[0]).toMatchObject({ method: "PUT", path: "/api/users/7/images/banner" });
    expect(mocks.user.bannerKey).toMatch(/^users\/7\/images\/banner\//);

    const image = await screen.findByRole("img", { name: "Capa de Ana Souza" });
    expect(image).toHaveAttribute("src", expect.stringContaining("/api/users/7/images/banner/file"));
    // A página recebe a chave: é ela que o cartão do pódio e o `<img>` usam para quebrar o cache.
    expect(onBannerChange).toHaveBeenCalledWith(mocks.user.bannerKey);
  });

  it("o campo de imagem não aceita PDF: nenhuma requisição sai e a capa não muda", async () => {
    const user = userEvent.setup({ delay: null });
    renderHeader(true);

    // Medido no V5-2d: `user.upload` respeita o `accept` do input e descarta sem disparar change.
    // Este caso prova a lista de aceitação do CAMPO; a recusa do servidor está congelada no teste
    // de rota ("PDF não é capa").
    await user.upload(
      screen.getByLabelText("Imagem de capa do perfil"),
      new File([new TextEncoder().encode("%PDF-1.7\n")], "relatorio.pdf", { type: "application/pdf" }),
    );

    expect(mocks.uploads).toEqual([]);
    expect(mocks.requests).toEqual([]);
    expect(mocks.user.bannerKey).toBeNull();
    expect(screen.queryByRole("img", { name: "Capa de Ana Souza" })).not.toBeInTheDocument();
  });

  it("PNG declarado como JPEG é recusado pela assinatura do seam", async () => {
    const user = userEvent.setup({ delay: null });
    renderHeader(true);

    await user.upload(
      screen.getByLabelText("Imagem de capa do perfil"),
      new File([PNG_BYTES], "disfarçado.jpg", { type: "image/jpeg" }),
    );

    expect(await screen.findByText(/Conteúdo não corresponde ao tipo declarado/)).toBeInTheDocument();
    expect(mocks.user.bannerKey).toBeNull();
    expect(screen.getByText("Sem capa")).toBeInTheDocument();
  });

  it("tirar a capa limpa a coluna, avisa a página e o botão de tirar some", async () => {
    const user = userEvent.setup({ delay: null });
    const onBannerChange = vi.fn();
    mocks.user.bannerKey = "users/7/images/banner/velha.png";
    renderHeader(true, mocks.user.bannerKey, onBannerChange);

    await user.click(screen.getByRole("button", { name: "Tirar capa" }));

    await waitFor(() =>
      expect(mocks.requests).toEqual([{ method: "DELETE", path: "/api/users/7/images/banner" }]),
    );
    expect(mocks.user.bannerKey).toBeNull();
    expect(onBannerChange).toHaveBeenCalledWith(null);
    expect(await screen.findByText("Sem capa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tirar capa" })).not.toBeInTheDocument();
  });

  it("confirmar 'não' no tirar não dispara nenhuma requisição", async () => {
    vi.stubGlobal("confirm", vi.fn<(message?: string) => boolean>(() => false));
    const user = userEvent.setup({ delay: null });
    mocks.user.bannerKey = "users/7/images/banner/velha.png";
    renderHeader(true, mocks.user.bannerKey);

    await user.click(screen.getByRole("button", { name: "Tirar capa" }));

    expect(mocks.requests).toEqual([]);
    expect(mocks.user.bannerKey).toBe("users/7/images/banner/velha.png");
  });

  it("servidor recusando chega na tela como aviso, sem quebrar o clique", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET" }, 503),
      ),
    );
    const user = userEvent.setup({ delay: null });
    renderHeader(true);

    await user.upload(
      screen.getByLabelText("Imagem de capa do perfil"),
      new File([PNG_BYTES], "capa.png", { type: "image/png" }),
    );

    expect(
      await screen.findByText("Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET"),
    ).toBeInTheDocument();
    // Rejeição não tratada em onClick quebra o gate do Vitest (medido no V4-4b).
    expect(screen.getByRole("button", { name: "Enviar capa" })).toBeEnabled();
  });
});

describe("S05 (R4) — faixa da capa do perfil em proporção 16:9", () => {
  it("com capa: o contêiner da imagem é aspect-video, sem altura fixa", () => {
    renderHeader(false, "users/7/images/banner/alpha.png");
    const strip = screen.getByRole("img", { name: "Capa de Ana Souza" }).parentElement!;
    expect(strip.className).toContain("aspect-video");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
  });

  it("sem capa: o placeholder ocupa a mesma faixa 16:9", () => {
    renderHeader(false, null);
    const strip = screen.getByText("Sem capa").parentElement!;
    expect(strip.className).toContain("aspect-video");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
  });
});
