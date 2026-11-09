/**
 * S02 (plan-v21) — painel de arquivos de entregável.
 *
 * Mesma costura medida de `project-files-panels.test.tsx` (lições que não mudam): a rede é um
 * `fetch` gravador porque o undici do jsdom não serializa `File` em `FormData` (MSW não serve);
 * o substituto CONSUME as funções do seam (`validateBlobUpload` + `readFileHead`), não reimplementa
 * a regra (DEC-90); `matchMedia` e `confirm` são stubs locais; `userEvent.setup({ delay: null })`.
 *
 * O que este arquivo congela:
 *   1. O voluntário (canManage=false) abre o arquivo pelo link da rota, e não vê campo de arquivo
 *      nem botão de enviar — a leitura é aberta (DEC-136), a escrita é da gestão.
 *   2. A gestão vê o campo e o botão POR ENTREGÁVEL, com rótulos que não se sobrepõem (lição da
 *      3.C: `getByLabel` casa por substring).
 *   3. O upload manda o `File` no campo `file` do path do entregável, e a linha entra na lista.
 *   4. A recusa do seam chega como aviso com a frase do seam, e a lista não muda.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Toaster } from "sonner"

import { ProjectDeliverablesPanel } from "@/components/features/project-deliverables-panel"
import { validateBlobUpload } from "@/lib/storage/blob-store"
import { readFileHead } from "@/lib/storage/magic-bytes"

interface DeliverableRow {
  id: number
  projectId: number
  name: string
  quantity: number
  createdAt: string
  goalId: number | null
}

interface FileRow {
  id: number
  deliverableId: number
  name: string
  contentType: string
  size: number
  uploadedBy: number
  uploadedAt: string
}

const mocks = {
  deliverables: [] as DeliverableRow[],
  files: [] as FileRow[],
  requests: [] as Array<{ method: string; path: string }>,
  uploads: [] as Array<{ field: string | null; name: string; type: string; size: number }>,
  nextId: 500,
}

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PDF_BYTES = new Uint8Array([..."%PDF-1.7\n".split("").map((c) => c.charCodeAt(0))])

function resetStore() {
  mocks.deliverables = [
    { id: 101, projectId: 7, name: "Relatório parcial", quantity: 2, createdAt: "2026-10-01T12:00:00.000Z", goalId: null },
    { id: 102, projectId: 7, name: "Slide da defesa", quantity: 1, createdAt: "2026-10-01T12:00:00.000Z", goalId: null },
  ]
  mocks.files = [
    {
      id: 301,
      deliverableId: 101,
      name: "GDD.pdf",
      contentType: "application/pdf",
      size: 1536,
      uploadedBy: 1,
      uploadedAt: "2026-10-01T12:00:00.000Z",
    },
  ]
  mocks.requests = []
  mocks.uploads = []
  mocks.nextId = 500
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })
}

/**
 * Substituto na forma das rotas reais (`{ deliverables }`, `{ files }`, `{ file }`, `{ error }`),
 * com a validação emprestada do seam — é o que impede o substituto de virar uma segunda regra.
 */
async function recordingFetch(input: unknown, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase()
  const path = new URL(String(input), "http://localhost:3000").pathname
  const segments = path.split("/") // ["", "api", "projects", "7", "deliverables", "101", "files"]

  if (segments[4] === "deliverables" && segments[6] === "files") {
    const deliverableId = Number(segments[5])
    if (method === "GET") {
      return jsonResponse({ files: mocks.files.filter((row) => row.deliverableId === deliverableId) })
    }
    if (method === "POST") {
      mocks.requests.push({ method, path })
      const form = init.body as FormData
      const file = form.get("file")
      mocks.uploads.push({
        field: form.has("file") ? "file" : null,
        name: file instanceof File ? file.name : "",
        type: file instanceof File ? file.type : "",
        size: file instanceof File ? file.size : 0,
      })
      if (!(file instanceof File)) {
        return jsonResponse({ error: "Arquivo é obrigatório" }, 400)
      }
      const validation = validateBlobUpload({
        contentType: file.type,
        size: file.size,
        head: await readFileHead(file),
      })
      if (!validation.ok) {
        return jsonResponse({ error: validation.error }, 400)
      }
      const row: FileRow = {
        id: ++mocks.nextId,
        deliverableId,
        name: file.name,
        contentType: file.type,
        size: file.size,
        uploadedBy: 1,
        uploadedAt: "2026-11-09T12:00:00.000Z",
      }
      mocks.files.push(row)
      return jsonResponse({ file: row }, 201)
    }
    if (method === "DELETE") {
      mocks.requests.push({ method, path })
      const fileId = Number(segments[7])
      const row = mocks.files.find((item) => item.id === fileId && item.deliverableId === deliverableId)
      if (!row) {
        return jsonResponse({ error: "Arquivo não encontrado" }, 404)
      }
      mocks.files = mocks.files.filter((item) => item.id !== fileId)
      return jsonResponse({ file: row })
    }
  }

  if (segments[4] === "deliverables" && segments.length === 5) {
    if (method === "GET") {
      return jsonResponse({ deliverables: mocks.deliverables })
    }
  }

  // O painel agora lê as metas pelo cliente do cronograma; este arquivo é sobre arquivos, o
  // cenário é sem metas.
  if (segments[4] === "cronograma" && method === "GET") {
    return jsonResponse({ cronograma: { projectId: 7, today: "2026-11-09", months: ["2026-11"], goals: [], activities: [] } })
  }

  throw new Error(`rota não prevista pelo gravador: ${method} ${path}`)
}

function renderPanel(canManage: boolean) {
  return render(
    <>
      <ProjectDeliverablesPanel projectId={7} canManage={canManage} />
      {/* Sem isto nenhum toast chega ao DOM (medido no V4-5a). */}
      <Toaster />
    </>,
  )
}

beforeEach(() => {
  resetStore()
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
  vi.stubGlobal("confirm", vi.fn<(message?: string) => boolean>(() => true))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("arquivos do entregável", () => {
  it("o voluntário abre o arquivo pelo link da rota, com o tamanho legível", async () => {
    renderPanel(false)
    const link = await screen.findByRole("link", { name: /GDD/ })
    expect(link).toHaveAttribute("href", "/api/projects/7/deliverables/101/files/301/file")
    // 1536 B -> 1,5 KB (vírgula: a tela é pt-BR)
    expect(screen.getByText("1,5 KB")).toBeInTheDocument()
  })

  it("quem não gerencia não vê campo de arquivo nem botão de enviar", async () => {
    renderPanel(false)
    await screen.findByRole("link", { name: /GDD/ })
    expect(screen.queryByRole("button", { name: "Enviar arquivo Relatório parcial" })).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Arquivo para Relatório parcial")).not.toBeInTheDocument()
  })

  it("a gestão vê campo e botão por entregável, e só no entregável com o arquivo no campo ele envia", async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel(true)
    await screen.findByRole("link", { name: /GDD/ })

    const uploadButton = screen.getByRole("button", { name: "Enviar arquivo Relatório parcial" })
    const field = screen.getByLabelText("Arquivo para Relatório parcial")
    expect(field).toBeInTheDocument()

    await user.upload(field, new File([PDF_BYTES], "projeto de pesquisa.pdf", { type: "application/pdf" }))
    await user.click(uploadButton)

    await waitFor(() => expect(mocks.uploads).toHaveLength(1))
    expect(mocks.uploads[0]).toEqual({
      field: "file",
      name: "projeto de pesquisa.pdf",
      type: "application/pdf",
      size: PDF_BYTES.byteLength,
    })
    expect(mocks.requests[0]).toMatchObject({
      method: "POST",
      path: "/api/projects/7/deliverables/101/files",
    })
    expect(await screen.findByRole("link", { name: /projeto de pesquisa/ })).toBeInTheDocument()
    expect(screen.getByText("9 B")).toBeInTheDocument()
  })

  it("a linha do entregável sem arquivo diz isso em palavras, e a gestão pode enviar o primeiro", async () => {
    renderPanel(true)
    await screen.findByRole("link", { name: /GDD/ })
    // `Slide da defesa` não tem arquivos: a linha diz isso, e o controle de envio existe —
    // sem ele a primeira upload de um entregável novo seria impossível.
    expect(await screen.findByText(/Nenhum arquivo enviado/)).toBeInTheDocument()
    expect(screen.getByLabelText("Arquivo para Slide da defesa")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Enviar arquivo Slide da defesa" })).toBeInTheDocument()
  })

  it("recusa do seam chega como aviso com a frase do seam, e a lista não muda", async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel(true)
    await screen.findByRole("link", { name: /GDD/ })

    // PNG com o tipo declarado de PDF: a assinatura é conferida pelo seam, como na rota.
    await user.upload(
      screen.getByLabelText("Arquivo para Relatório parcial"),
      new File([PNG_BYTES], "disfarçado.pdf", { type: "application/pdf" }),
    )
    await user.click(screen.getByRole("button", { name: "Enviar arquivo Relatório parcial" }))

    expect(await screen.findByText(/Conteúdo não corresponde ao tipo declarado/)).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /disfarçado/ })).not.toBeInTheDocument()
    expect(mocks.files.filter((row) => row.id > 301)).toEqual([])
  })

  it("a leitura de arquivos não engole as linhas do entregável: nomes e quantidades seguem", async () => {
    renderPanel(false)
    await screen.findByRole("link", { name: /GDD/ })
    expect(screen.getByText("Relatório parcial")).toBeInTheDocument()
    expect(screen.getByText("2 un.")).toBeInTheDocument()
    expect(screen.getByText("Slide da defesa")).toBeInTheDocument()
    expect(screen.getByText("1 un.")).toBeInTheDocument()
  })

  it("quem não gerencia não vê o botão de remover o arquivo", async () => {
    renderPanel(false)
    await screen.findByRole("link", { name: /GDD/ })
    expect(screen.queryByRole("button", { name: /^Remover arquivo/ })).not.toBeInTheDocument()
  })

  it("a gestão remove o arquivo da linha com confirmação, e a linha do entregável fica", async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel(true)
    await screen.findByRole("link", { name: /GDD/ })

    await user.click(screen.getByRole("button", { name: "Remover arquivo GDD.pdf" }))

    await waitFor(() => expect(mocks.requests.some((r) => r.method === "DELETE")).toBe(true))
    expect(mocks.requests.find((r) => r.method === "DELETE")).toMatchObject({
      method: "DELETE",
      path: "/api/projects/7/deliverables/101/files/301",
    })
    expect(mocks.files.find((row) => row.id === 301)).toBeUndefined()
    await waitFor(() => expect(screen.queryByRole("link", { name: /GDD/ })).not.toBeInTheDocument())
    expect(screen.getByText("Relatório parcial")).toBeInTheDocument()
    expect(screen.getByText("2 un.")).toBeInTheDocument()
    // a lista vazia diz isso em palavras, como a linha sem arquivo do S02 — escopo na LINHA do
    // entregável: `Slide da defesa` já nasce com a sua própria frase vazia.
    const row = screen.getByText("Relatório parcial").closest("li")!
    expect(row.querySelector("p")).toHaveTextContent(/Nenhum arquivo enviado/)
  })
})
