/**
 * S06 (plan-v21, R10) — dialog de descrição com preview.
 *
 * Por que existe: o dialog é a parte que o `tsc` não cobre. O preview é a MESMA peça de
 * markdown da tela do projeto (`lib/markdown-render`) — o teste prova o escapamento na tela:
 * `<script>` cru nunca vira script, e `**negrito**` vira `<strong>`. O substituto de rede é
 * o da forma da rota (`{ project }`, `{ error }`) e grava o corpo que sai.
 *
 * Costura medida: `Toaster` montado, `matchMedia` stubado local, `setup({ delay: null })`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Toaster } from "sonner"

import { ProjectDescriptionDialog } from "@/components/features/project-description-dialog"

const mocks = {
  requests: [] as Array<{ method: string; path: string; json?: Record<string, unknown> }>,
  refuse: false,
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })
}

function recordingFetch(input: unknown, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase()
  const path = new URL(String(input), "http://localhost:3000").pathname
  mocks.requests.push({
    method,
    path,
    json: init.body && typeof init.body === "string" ? JSON.parse(String(init.body)) : undefined,
  })
  if (method === "POST" && path.endsWith("/markdown-images")) {
    const key = "projects/7/markdown-images/11111111-2222-3333-4444-555555555555.png"
    return jsonResponse({ key, url: `/api/projects/7/markdown-images/11111111-2222-3333-4444-555555555555.png?v=${key}`, name: "fluxo.png" })
  }
  if (mocks.refuse) {
    return jsonResponse({ error: "Usuário não tem permissão para gerenciar este projeto" }, 403)
  }
  const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
  return jsonResponse({
    project: {
      id: 7,
      name: "Alpha",
      description: body.description ?? null,
      createdAt: "2026-10-01T12:00:00.000Z",
      createdBy: 1,
      leaderId: 2,
      status: "active",
      links: null,
    },
  })
}

function renderDialog(onSaved?: () => void) {
  return render(
    <>
      <ProjectDescriptionDialog
        open
        projectId={7}
        initialDescription="**negrito**"
        onOpenChange={() => undefined}
        onSaved={onSaved}
      />
      <Toaster />
    </>,
  )
}

beforeEach(() => {
  mocks.requests = []
  mocks.refuse = false
  vi.stubGlobal("fetch", vi.fn(recordingFetch))
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
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("imagens na descrição (R11, S07)", () => {
  it('o botão "Anexar imagem" envia o arquivo e insere ![nome](url) no cursor', async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    const textarea = await screen.findByRole<HTMLTextAreaElement>("textbox", { name: "Descrição em markdown" })
    textarea.setSelectionRange(4, 4)
    const input = screen.getByTestId("input-imagem-descricao")
    await user.upload(input, new File([new Uint8Array(8)], "fluxo.png", { type: "image/png" }))
    await waitFor(() =>
      expect(textarea.value).toContain("![fluxo.png](/api/projects/7/markdown-images/11111111-2222-3333-4444-555555555555.png?v=projects/7/markdown-images/11111111-2222-3333-4444-555555555555.png)"),
    )
    // O cursor estava em 4: a inserção entra ali, não no fim.
    expect(textarea.value.startsWith("****![fluxo.png]")).toBe(false)
    expect(textarea.value.indexOf("![fluxo.png]")).toBe(4)
    const post = mocks.requests.find((entry) => entry.method === "POST" && entry.path === "/api/projects/7/markdown-images")
    expect(post).toBeDefined()
    expect(previewHasImg()).toBe(true)
  })

  it("o drop de PNG sobre o editor envia e insere igual", async () => {
    renderDialog()
    const textarea = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Descrição em markdown" })
    const dataTransfer = { files: [new File([new Uint8Array(8)], "fluxo.png", { type: "image/png" })] }
    fireEvent.drop(textarea, { dataTransfer })
    await waitFor(() =>
      expect(textarea.value).toContain("![fluxo.png](/api/projects/7/markdown-images/11111111-2222-3333-4444-555555555555.png?v=projects/7/markdown-images/11111111-2222-3333-4444-555555555555.png)"),
    )
  })

  it("nenhum arquivo enviado: nenhum POST sai", async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    const input = screen.getByTestId("input-imagem-descricao")
    expect(input).toHaveAttribute("accept", expect.stringContaining("image/png"))
    const post = mocks.requests.find((entry) => entry.method === "POST")
    expect(post).toBeUndefined()
    void user
  })
})

function previewHasImg() {
  const preview = screen.getByTestId("preview-de-descricao")
  return preview.querySelector("img") !== null
}

describe("dialog de descrição", () => {
  it("abre com a descrição no textarea e o preview renderizado", async () => {
    renderDialog()
    const textarea = await screen.findByRole("textbox", { name: "Descrição em markdown" })
    expect(textarea).toHaveValue("**negrito**")
    // A peça única renderiza: `**negrito**` vira `<strong>` no preview.
    const preview = screen.getByTestId("preview-de-descricao")
    expect(preview.querySelector("strong")?.textContent).toBe("negrito")
  })

  it("o preview escapa HTML cru — script nunca vira script", async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    const textarea = await screen.findByRole("textbox", { name: "Descrição em markdown" })
    await user.type(textarea, "<script>alert(1)</script>")

    const preview = screen.getByTestId("preview-de-descricao")
    expect(preview.textContent).toContain("<script>alert(1)</script>")
    expect(preview.querySelector("script")).toBeNull()
    expect(document.querySelector("script[src]") === null).toBe(true)
  })

  it("Salvar manda PUT só com description e fecha o dialog", async () => {
    const user = userEvent.setup({ delay: null })
    const onSaved = vi.fn()
    const { rerender } = render(
      <ProjectDescriptionDialog open projectId={7} initialDescription="" onOpenChange={() => undefined} onSaved={onSaved} />,
      { wrapper: null as never },
    )
    const textarea = screen.getByRole("textbox", { name: "Descrição em markdown" })
    await user.type(textarea, "novo corpo")
    await user.click(screen.getByRole("button", { name: "Salvar descrição" }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    const put = mocks.requests.find((entry) => entry.method === "PUT" && entry.path === "/api/projects/7/description")
    expect(put?.json).toEqual({ description: "novo corpo" })
    rerender(<ProjectDescriptionDialog open={false} projectId={7} initialDescription="" onOpenChange={() => undefined} onSaved={onSaved} />)
    expect(screen.queryByRole("textbox", { name: "Descrição em markdown" })).not.toBeInTheDocument()
  })

  it("Cancelar não escreve nada", async () => {
    const user = userEvent.setup({ delay: null })
    renderDialog()
    const textarea = await screen.findByRole("textbox", { name: "Descrição em markdown" })
    await user.type(textarea, "texto não salvo")
    await user.click(screen.getByRole("button", { name: "Cancelar" }))

    expect(mocks.requests).toEqual([])
  })

  it("recusa do servidor chega como aviso com a frase da rota", async () => {
    mocks.refuse = true
    const user = userEvent.setup({ delay: null })
    renderDialog()
    const textarea = await screen.findByRole("textbox", { name: "Descrição em markdown" })
    await user.type(textarea, "x")
    await user.click(screen.getByRole("button", { name: "Salvar descrição" }))

    expect(await screen.findByText("Usuário não tem permissão para gerenciar este projeto")).toBeInTheDocument()
  })
})
