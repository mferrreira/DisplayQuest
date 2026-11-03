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
 * `readFileHead`) e a conta do domínio (`clampBannerCrop`) em vez de reimplementar as regras (DEC-90),
 * e responde no formato das rotas (`{ user }`, `{ error }`).
 *
 * S05 (plan-v12, DEC-241): escolhido o arquivo, o editor abre sobre o original; a上传 (upload) e o
 * recorte saem no SALVAR. O caminho de arrasto não se prova aqui: no jsdom o contêiner mede 0 e a
 * peça guarda (não move o centro) — a geometria é provada no navegador pela demo da fatia.
 *
 * Costura medida (as mesmas do arquivo irmão):
 *   - nenhum texto de toast chega ao DOM sem `<Toaster/>` montado, e montá-lo exige `matchMedia`,
 *     que o jsdom desta base não tem — o stub é LOCAL a este arquivo.
 *   - `confirm` não existe no jsdom, e `URL.createObjectURL` também não (stub LOCAL).
 *   - `userEvent` cru é lento sob carga paralela: `setup({ delay: null })`.
 *   - `user.upload` respeita o `accept` do input e descarta em silêncio o arquivo fora da lista.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { UserMediaHeader } from "@/components/features/user-media-header";
import { isImageBlobContentType, validateBlobUpload } from "@/lib/storage/blob-store";
import { readFileHead } from "@/lib/storage/magic-bytes";
import { clampBannerCrop } from "@/backend/domain";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface MockUser {
  bannerKey: string | null;
  bannerCropX: number | null;
  bannerCropY: number | null;
  bannerCropZoom: number | null;
}

const mocks = {
  user: { bannerKey: null, bannerCropX: null, bannerCropY: null, bannerCropZoom: null } as MockUser,
  uploads: [] as Array<{ field: string | null; name: string; type: string; size: number }>,
  requests: [] as Array<{ method: string; path: string; body?: string }>,
  nextId: 0,
};

function resetStore() {
  mocks.user = { bannerKey: null, bannerCropX: null, bannerCropY: null, bannerCropZoom: null };
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

/**
 * Substituto na forma das rotas reais: `PUT` multipart em `/api/users/<id>/images/banner`,
 * `PUT` JSON em `/api/users/<id>/images/banner/crop`, `DELETE` no slot.
 */
async function recordingFetch(input: unknown, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const path = new URL(String(input), "http://localhost:3000").pathname;
  const body = typeof init.body === "string" ? init.body : undefined;
  mocks.requests.push({ method, path, body });

  const segments = path.split("/"); // ["", "api", "users", "7", "images", "banner", "crop"?]
  const isCrop = segments[6] === "crop";
  const slot = segments[5] === "banner" ? segments[5] : null;
  if (segments[4] !== "images" || !slot) {
    throw new Error(`rota não prevista pelo gravador: ${method} ${path}`);
  }

  if (method === "DELETE") {
    mocks.user.bannerKey = null;
    mocks.user.bannerCropX = null;
    mocks.user.bannerCropY = null;
    mocks.user.bannerCropZoom = null;
    return jsonResponse({ user: { ...mocks.user } });
  }

  if (isCrop) {
    const raw = JSON.parse(String(body));
    const clamped = clampBannerCrop(raw);
    mocks.user.bannerCropX = clamped.x;
    mocks.user.bannerCropY = clamped.y;
    mocks.user.bannerCropZoom = clamped.zoom;
    return jsonResponse({ user: { ...mocks.user } }, 200);
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
  // Subir capa nova zera o recorte no servidor (DEC-239): o original mudou.
  mocks.user.bannerCropX = null;
  mocks.user.bannerCropY = null;
  mocks.user.bannerCropZoom = null;
  return jsonResponse({ user: { ...mocks.user } }, 200);
}

function renderHeader(
  canEdit: boolean,
  bannerKey: string | null = null,
  onBannerChange = vi.fn(),
  bannerCrop: { x: number; y: number; zoom: number } | null = null,
) {
  return render(
    <>
      <UserMediaHeader
        userId={7}
        userName="Ana Souza"
        bannerKey={bannerKey}
        bannerCrop={bannerCrop}
        canEdit={canEdit}
        onBannerChange={onBannerChange}
      />
      {/* Sem isto nenhum toast chega ao DOM (medido no V4-5a). */}
      <Toaster />
    </>,
  );
}

/** O editor abre sobre o arquivo escolhido; no jsdom não há blob URL real. */
function stubObjectUrl() {
  // Stub LOCAL: `URL.createObjectURL` não existe no jsdom desta base — a peça guarda por `typeof`.
  URL.createObjectURL = (file: File) => `blob:preview/${file.name}`
}

async function chooseFile(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.upload(screen.getByLabelText("Imagem de capa do perfil"), file);
}

async function saveInEditor(user: ReturnType<typeof userEvent.setup>) {
  const dialog = await screen.findByRole("dialog", { name: "Recorte da capa" });
  expect(screen.getByText(/Resolução recomendada: 2100×900 px \(21:9\)/)).toBeInTheDocument();
  void dialog
  await user.click(screen.getByRole("button", { name: "Salvar recorte" }));
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
  stubObjectUrl();
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
    expect(screen.queryByRole("button", { name: "Recortar capa" })).not.toBeInTheDocument();
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

  it("escolher a capa abre o editor sobre o arquivo, e o salvar escreve no slot banner e sobe a chave", async () => {
    const user = userEvent.setup({ delay: null });
    const onBannerChange = vi.fn();
    renderHeader(true, null, onBannerChange);

    await chooseFile(user, new File([PNG_BYTES], "capa do laboratório.png", { type: "image/png" }));

    // O editor abre com o texto da resolução recomendada e a pré-visualização do arquivo.
    const dialog = await screen.findByRole("dialog", { name: "Recorte da capa" });
    expect(screen.getByText(/Resolução recomendada: 2100×900 px \(21:9\)/)).toBeInTheDocument();
    expect(dialog.querySelector("img")).toHaveAttribute("src", expect.stringContaining("blob:preview/capa do laboratório.png"));
    // Nada foi gravado antes do salvar.
    expect(mocks.uploads).toEqual([]);
    expect(mocks.requests).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Salvar recorte" }));

    await waitFor(() => expect(mocks.uploads).toHaveLength(1));
    expect(mocks.uploads[0]).toMatchObject({
      field: "file",
      name: "capa do laboratório.png",
      type: "image/png",
    });
    expect(mocks.requests[0]).toMatchObject({ method: "PUT", path: "/api/users/7/images/banner" });
    // A chave entra no endereço: sem isto o navegador serviria a capa velha depois de trocar.
    expect(mocks.user.bannerKey).toMatch(/^users\/7\/images\/banner\//);

    const image = await screen.findByRole("img", { name: "Capa de Ana Souza" });
    expect(image).toHaveAttribute("src", expect.stringContaining("/api/users/7/images/banner/file"));
    // A página recebe a chave: é ela que o cartão do pódio e o `<img>` usam para quebrar o cache.
    expect(onBannerChange).toHaveBeenCalledWith(mocks.user.bannerKey);
  });

  it("o campo de imagem não aceita PDF: o editor nem abre, e nenhuma requisição sai", async () => {
    const user = userEvent.setup({ delay: null });
    renderHeader(true);

    // Medido no V5-2d: `user.upload` respeita o `accept` do input e descarta sem disparar change.
    // Este caso prova a lista de aceitação do CAMPO; a recusa do servidor está congelada no teste
    // de rota ("PDF não é capa").
    await chooseFile(user, new File([new TextEncoder().encode("%PDF-1.7\n")], "relatorio.pdf", { type: "application/pdf" }));

    expect(screen.queryByRole("dialog", { name: "Recorte da capa" })).not.toBeInTheDocument();
    expect(mocks.uploads).toEqual([]);
    expect(mocks.requests).toEqual([]);
    expect(mocks.user.bannerKey).toBeNull();
    expect(screen.queryByRole("img", { name: "Capa de Ana Souza" })).not.toBeInTheDocument();
  });

  it("PNG declarado como JPEG é recusado pela assinatura do seam, no salvar", async () => {
    const user = userEvent.setup({ delay: null });
    renderHeader(true);

    await chooseFile(user, new File([PNG_BYTES], "disfarçado.jpg", { type: "image/jpeg" }));
    await saveInEditor(user);

    expect(await screen.findByText(/Conteúdo não corresponde ao tipo declarado/)).toBeInTheDocument();
    expect(mocks.user.bannerKey).toBeNull();
    expect(screen.getByText("Sem capa")).toBeInTheDocument();
  });

  it("re-recortar abre sobre o binário do bucket, não sobre o recorte, e o salvar grava só as colunas", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.user.bannerKey = "users/7/images/banner/velha.png";
    renderHeader(true, mocks.user.bannerKey, vi.fn(), { x: 0.5, y: 0.5, zoom: 1 });

    await user.click(screen.getByRole("button", { name: "Recortar capa" }));

    const dialog = await screen.findByRole("dialog", { name: "Recorte da capa" });
    // Re-recorte = o ORIGINAL no bucket, com a chave como quebra de cache (a chave é URL-encoded
    // pelo seam `userImageUrl` — a forma que a tela já congela no teste do V5-3).
    expect(dialog.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("v=users%2F7%2Fimages%2Fbanner%2Fvelha.png"),
    );

    fireEvent.change(screen.getByRole("slider", { name: "Zoom da capa" }), { target: { value: "2" } });
    await user.click(screen.getByRole("button", { name: "Salvar recorte" }));

    await waitFor(() =>
      expect(mocks.requests).toEqual([
        { method: "PUT", path: "/api/users/7/images/banner/crop", body: JSON.stringify({ x: 0.5, y: 0.5, zoom: 2 }) },
      ]),
    );
    expect(mocks.user.bannerKey).toBe("users/7/images/banner/velha.png");
    expect(mocks.user.bannerCropZoom).toBe(2);
    // Nenhuma upload: o byte não se move, só os parâmetros.
    expect(mocks.uploads).toEqual([]);
  });

  it("cancelar o editor não grava nada nem muda a capa", async () => {
    const user = userEvent.setup({ delay: null });
    renderHeader(true, null, vi.fn());

    await chooseFile(user, new File([PNG_BYTES], "capa.png", { type: "image/png" }));
    const dialog = await screen.findByRole("dialog", { name: "Recorte da capa" });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    expect(mocks.uploads).toEqual([]);
    expect(mocks.requests).toEqual([]);
    expect(mocks.user.bannerKey).toBeNull();
  });

  it("tirar a capa limpa a coluna, avisa a página e o botão de tirar some", async () => {
    const user = userEvent.setup({ delay: null });
    const onBannerChange = vi.fn();
    mocks.user.bannerKey = "users/7/images/banner/velha.png";
    mocks.user.bannerCropZoom = 2;
    renderHeader(true, mocks.user.bannerKey, onBannerChange, { x: 0.5, y: 0.5, zoom: 2 });

    await user.click(screen.getByRole("button", { name: "Tirar capa" }));

    await waitFor(() =>
      expect(mocks.requests).toEqual([{ method: "DELETE", path: "/api/users/7/images/banner" }]),
    );
    expect(mocks.user.bannerKey).toBeNull();
    expect(mocks.user.bannerCropZoom).toBeNull();
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

    await chooseFile(user, new File([PNG_BYTES], "capa.png", { type: "image/png" }));
    await saveInEditor(user);

    expect(
      await screen.findByText("Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET"),
    ).toBeInTheDocument();
    // Rejeição não tratada em onClick quebra o gate do Vitest (medido no V4-4b).
    expect(screen.getByRole("button", { name: "Enviar capa" })).toBeEnabled();
  });

  it("a faixa da capa renderiza pela peça única com o recorte, em 21:9 e sem altura fixa", () => {
    renderHeader(false, "users/7/images/banner/alpha.png", vi.fn(), { x: 0.3, y: 0.6, zoom: 2 });
    const image = screen.getByRole("img", { name: "Capa de Ana Souza" });
    // O `<img>` mora na peça única; a faixa 21:9 é o contêiner de fora.
    expect(image.closest('[data-banner-crop="true"]')).not.toBeNull();
    const strip = image.parentElement!.parentElement!;
    expect(strip.className).toContain("aspect-[21/9]");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
    // O transform transporta os parâmetros: zoom 2 com centro (0.3, 0.6).
    expect(image.getAttribute("style")).toContain("scale(2)");
  });

  it("sem capa: o placeholder ocupa a mesma faixa 21:9", () => {
    renderHeader(false, null);
    const strip = screen.getByText("Sem capa").parentElement!;
    expect(strip.className).toContain("aspect-[21/9]");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
  });
});
