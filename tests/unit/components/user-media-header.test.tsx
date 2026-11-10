/**
 * V5-3 (DEC-137) + DEC-242 — teste de UI do cabeçalho de mídia do perfil.
 *
 * Por que existe: o cabeçalho e as duas telas que o consomem são a parte do batch que o `tsc` não
 * cobre. A rede é um `fetch` gravador e não MSW pela razão medida no V5-2c: o `fetch` do undici que o
 * Vitest injeta no jsdom não serializa um `File` do jsdom dentro de um `FormData`. Inspecionar o
 * `FormData` direto prova o campo (`file`), o nome e o tipo do arquivo. O multipart de verdade está
 * congelado em `tests/unit/api/user-image-routes.test.ts`.
 *
 * O substituto de rede CONSUME as funções do seam (`isImageBlobContentType`, `validateBlobUpload`,
 * `readFileHead`) em vez de reimplementar as regras (DEC-90), e responde no formato das rotas
 * (`{ user }`, `{ error }`). O recorte saiu por decisão do dono (2026-11-05): o upload vai direto
 * ao slot, sem editor.
 *
 * Costura medida (as mesmas do arquivo irmão):
 *   - nenhum texto de toast chega ao DOM sem `<Toaster/>` montado, e montá-lo exige `matchMedia`,
 *     que o jsdom desta base não tem — o stub é LOCAL a este arquivo.
 *   - `confirm` não existe no jsdom.
 *   - `userEvent` cru é lento sob carga paralela: `setup({ delay: null })`.
 *   - `user.upload` respeita o `accept` do input e descarta em silêncio o arquivo fora da lista.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toaster } from "sonner";

import { UserMediaHeader } from "@/components/features/user-media-header";
import { isImageBlobContentType, validateBlobUpload } from "@/lib/storage/blob-store";
import { readFileHead } from "@/lib/storage/magic-bytes";

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface MockUser {
  bannerKey: string | null;
  avatarKey: string | null;
}

const mocks = {
  user: { bannerKey: null, avatarKey: null } as MockUser,
  uploads: [] as Array<{ field: string | null; name: string; type: string; size: number }>,
  requests: [] as Array<{ method: string; path: string; body?: string }>,
  nextId: 0,
};

function resetStore() {
  mocks.user = { bannerKey: null, avatarKey: null };
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
 * Substituto na forma das rotas reais: `PUT` multipart e `DELETE` em `/api/users/<id>/images/<slot>`.
 * Os slots são `banner` (capa) e `avatar`. Não há rota de recorte: o recorte saiu.
 */
async function recordingFetch(input: unknown, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase();
  const path = new URL(String(input), "http://localhost:3000").pathname;
  mocks.requests.push({ method, path, body: typeof init.body === "string" ? init.body : undefined });

  const segments = path.split("/"); // ["", "api", "users", "7", "images", "banner"]
  const slot = segments[5] === "banner" ? "banner" : segments[5] === "avatar" ? "avatar" : null;
  if (segments[4] !== "images" || !slot) {
    throw new Error(`rota não prevista pelo gravador: ${method} ${path}`);
  }

  if (method === "DELETE") {
    if (slot === "banner") {
      mocks.user.bannerKey = null;
    } else {
      mocks.user.avatarKey = null;
    }
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

  if (slot === "banner") {
    mocks.user.bannerKey = `users/7/images/banner/novo-${++mocks.nextId}.png`;
  } else {
    mocks.user.avatarKey = `users/7/images/avatar/novo-${++mocks.nextId}.png`;
  }
  return jsonResponse({ user: { ...mocks.user } }, 200);
}

function renderHeader(
  canEdit: boolean,
  bannerKey: string | null = null,
  onBannerChange = vi.fn(),
  avatarKey: string | null = null,
) {
  return render(
    <>
      <UserMediaHeader
        userId={7}
        userName="Ana Souza"
        bannerKey={bannerKey}
        avatarKey={avatarKey}
        canEdit={canEdit}
        onBannerChange={onBannerChange}
      />
      {/* Sem isto nenhum toast chega ao DOM (medido no V4-5a). */}
      <Toaster />
    </>,
  );
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Opções da capa do perfil" }));
}

/** plan-v14 S05 (regra 5): o controle é item do menu aberto pelo clique da faixa. */
async function chooseFile(user: ReturnType<typeof userEvent.setup>, file: File) {
  await openMenu(user);
  await user.click(await screen.findByRole("menuitem", { name: "Enviar capa" }));
  await user.upload(screen.getByLabelText("Imagem de capa do perfil"), file);
}

async function chooseAvatarFile(user: ReturnType<typeof userEvent.setup>, file: File) {
  await openMenu(user);
  await user.click(await screen.findByRole("menuitem", { name: "Enviar avatar" }));
  await user.upload(screen.getByLabelText("Imagem do avatar do perfil"), file);
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
    expect(screen.queryByRole("menuitem", { name: "Tirar capa" })).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "Opções da capa do perfil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Enviar capa" })).not.toBeInTheDocument();
  });

  it("enviar a capa sobe o arquivo no slot banner, grava a chave e avisa a página", async () => {
    const user = userEvent.setup({ delay: null });
    const onBannerChange = vi.fn();
    renderHeader(true, null, onBannerChange);

    await chooseFile(user, new File([PNG_BYTES], "capa do laboratório.png", { type: "image/png" }));

    await vi.waitFor(() => expect(mocks.uploads).toHaveLength(1));
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
    expect(await screen.findByText("Capa atualizada")).toBeInTheDocument();
  });

  it("o campo de imagem não aceita PDF: nenhuma requisição sai", async () => {
    const user = userEvent.setup({ delay: null });
    renderHeader(true);

    // Medido no V5-2d: `user.upload` respeita o `accept` do input e descarta sem disparar change.
    // Este caso prova a lista de aceitação do CAMPO; a recusa do servidor está congelada no teste
    // de rota ("PDF não é capa").
    await chooseFile(user, new File([new TextEncoder().encode("%PDF-1.7\n")], "relatorio.pdf", { type: "application/pdf" }));

    expect(mocks.uploads).toEqual([]);
    expect(mocks.requests).toEqual([]);
    expect(mocks.user.bannerKey).toBeNull();
    expect(screen.queryByRole("img", { name: "Capa de Ana Souza" })).not.toBeInTheDocument();
  });

  it("PNG declarado como JPEG é recusado pela assinatura do seam", async () => {
    const user = userEvent.setup({ delay: null });
    renderHeader(true);

    await chooseFile(user, new File([PNG_BYTES], "disfarçado.jpg", { type: "image/jpeg" }));

    expect(await screen.findByText(/Conteúdo não corresponde ao tipo declarado/)).toBeInTheDocument();
    expect(mocks.user.bannerKey).toBeNull();
    expect(screen.getByText("Sem capa")).toBeInTheDocument();
  });

  it("tirar a capa limpa a coluna, avisa a página e o item do menu some", async () => {
    const user = userEvent.setup({ delay: null });
    const onBannerChange = vi.fn();
    mocks.user.bannerKey = "users/7/images/banner/velha.png";
    renderHeader(true, mocks.user.bannerKey, onBannerChange);

    await openMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Tirar capa" }));

    await vi.waitFor(() =>
      expect(mocks.requests).toEqual([{ method: "DELETE", path: "/api/users/7/images/banner" }]),
    );
    expect(mocks.user.bannerKey).toBeNull();
    expect(onBannerChange).toHaveBeenCalledWith(null);
    expect(await screen.findByText("Sem capa")).toBeInTheDocument();

    // O item sumiu: reabrir o menu não o acha.
    await openMenu(user);
    expect(within(screen.getByRole("menu")).queryByRole("menuitem", { name: "Tirar capa" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
  });

  it("confirmar 'não' no tirar não dispara nenhuma requisição", async () => {
    vi.stubGlobal("confirm", vi.fn<(message?: string) => boolean>(() => false));
    const user = userEvent.setup({ delay: null });
    mocks.user.bannerKey = "users/7/images/banner/velha.png";
    renderHeader(true, mocks.user.bannerKey);

    await openMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Tirar capa" }));

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

    expect(
      await screen.findByText("Bucket de arquivos não configurado — defina S3_ENDPOINT e S3_BUCKET"),
    ).toBeInTheDocument();
    // Rejeição não tratada em onClick quebra o gate do Vitest (medido no V4-4b).
    expect(screen.getByRole("button", { name: "Opções da capa do perfil" })).toBeEnabled();
  });

  it("a faixa da capa renderiza em 21:9, sem altura fixa e sem corte", () => {
    renderHeader(false, "users/7/images/banner/alpha.png", vi.fn());
    const image = screen.getByRole("img", { name: "Capa de Ana Souza" });
    // O recorte saiu: o `<img>` é cover simples, sem peça de recorte.
    expect(image.closest('[data-banner-crop="true"]')).toBeNull();
    expect(image.getAttribute("style")).toBeNull();
    const strip = image.parentElement!.parentElement!;
    expect(strip.className).toContain("aspect-[21/9]");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
  });

  it("sem capa: o placeholder ocupa a mesma faixa 21:9", () => {
    renderHeader(false, null);
    const strip = screen.getByText("Sem capa").parentElement!;
    expect(strip.className).toContain("aspect-[21/9]");
    expect(strip.className).not.toMatch(/(^|\s)h-\d/);
  });

  // ---------- DEC-242: o avatar no bucket ----------

  it("enviar o avatar sobe o arquivo no slot avatar sem tocar a capa", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.user.bannerKey = "users/7/images/banner/velha.png";
    renderHeader(true, mocks.user.bannerKey, vi.fn());

    await chooseAvatarFile(user, new File([PNG_BYTES], "foto.png", { type: "image/png" }));

    await vi.waitFor(() => expect(mocks.uploads).toHaveLength(1));
    expect(mocks.uploads[0]).toMatchObject({ field: "file", name: "foto.png", type: "image/png" });
    expect(mocks.requests[0]).toMatchObject({ method: "PUT", path: "/api/users/7/images/avatar" });
    expect(mocks.user.avatarKey).toMatch(/^users\/7\/images\/avatar\//);
    // A capa é objeto separado: o enviar avatar não a toca.
    expect(mocks.user.bannerKey).toBe("users/7/images/banner/velha.png");
    expect(await screen.findByText("Avatar atualizado")).toBeInTheDocument();
  });

  it("tirar o avatar limpa a chave sem tocar a capa", async () => {
    const user = userEvent.setup({ delay: null });
    mocks.user.bannerKey = "users/7/images/banner/velha.png";
    mocks.user.avatarKey = "users/7/images/avatar/velho.png";
    renderHeader(true, mocks.user.bannerKey, vi.fn(), mocks.user.avatarKey);

    await openMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Tirar avatar" }));

    await vi.waitFor(() =>
      expect(mocks.requests).toEqual([{ method: "DELETE", path: "/api/users/7/images/avatar" }]),
    );
    expect(mocks.user.avatarKey).toBeNull();
    // A capa é objeto separado: o tirar avatar não a toca.
    expect(mocks.user.bannerKey).toBe("users/7/images/banner/velha.png");
  });
});
