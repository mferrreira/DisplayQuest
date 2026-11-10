/**
 * S05 (plan-v21, DEC-260) — o checkbox "Cumprir meta N" no Cronograma do detalhe do projeto.
 *
 * Por que existe: a linha da meta ganhou um controle de escrita, e a lição da casa está
 * registrada — mock que ignora chave do corpo deixa o teste verde provando só que o input
 * existe (V5-4/V5-6). O substituto aplica o cumprimento como a rota faria (grava `completedAt`
 * e `completedBy` ao marcar, zera ao desmarcar) e grava o corpo que sai para a rota. O que se
 * prova é o percurso: checkbox → cliente → corpo `{ completed }` → resposta → linha.
 *
 * Costura medida (mesma dos painéis de arquivo): `useAuth` dobrado, `Toaster` montado,
 * `matchMedia` stubado LOCAL, `setup({ delay: null })` pela lição do flake V4-6b.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Toaster } from "sonner"

import { ProjectCronogramaPanel } from "@/components/features/project-cronograma-panel"

const PROJECT = 7

const authMocks = vi.hoisted(() => ({
  user: null as null | { id: number; name: string; email: string; roles: string[] },
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: authMocks.user }),
}))

interface GoalRow {
  id: number
  projectId: number
  order: number
  target: number | null
  description: string
  createdAt: string
  completedAt: string | null
  completedBy: number | null
}

const mocks = {
  goals: [] as GoalRow[],
  requests: [] as Array<{ method: string; path: string; json?: Record<string, unknown> }>,
  refuseWrite: false,
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })
}

function resetStore() {
  mocks.goals = [
    {
      id: 301,
      projectId: PROJECT,
      order: 1,
      target: 1,
      description: "Publicar artigo",
      createdAt: "2026-10-01T12:00:00.000Z",
      completedAt: "2026-10-20T12:00:00.000Z",
      completedBy: 9,
    },
    {
      id: 302,
      projectId: PROJECT,
      order: 2,
      target: null,
      description: "Revisão da literatura",
      createdAt: "2026-10-01T12:00:00.000Z",
      completedAt: null,
      completedBy: null,
    },
  ]
  mocks.requests = []
  mocks.refuseWrite = false
}

/**
 * Substituto de rede na forma das rotas reais. O cumprimento segue a regra da rota: marcar
 * grava `completedAt`/`completedBy`, desmarcar zera, e o 403 da gestão é o corpo congelado.
 */
async function recordingFetch(input: unknown, init: RequestInit = {}) {
  const method = (init.method ?? "GET").toUpperCase()
  const path = new URL(String(input), "http://localhost:3000").pathname
  const segments = path.split("/")

  if (segments[4] === "cronograma" && method === "GET") {
    return jsonResponse({
      cronograma: {
        projectId: PROJECT,
        today: "2026-11-09",
        months: ["2026-11"],
        goals: mocks.goals,
        activities: [],
      },
    })
  }

  if (segments[4] === "goals" && segments[6] === "completion" && method === "PUT") {
    const goalId = Number(segments[5])
    const body = JSON.parse(String(init.body)) as { completed?: unknown }
    mocks.requests.push({ method, path, json: body })
    if (mocks.refuseWrite) {
      return jsonResponse({ error: "Usuário não tem permissão para gerenciar este projeto" }, 403)
    }
    const row = mocks.goals.find((goal) => goal.id === goalId)!
    if (body.completed === true) {
      row.completedAt = "2026-11-09T18:00:00.000Z"
      row.completedBy = authMocks.user?.id ?? null
    } else {
      row.completedAt = null
      row.completedBy = null
    }
    return jsonResponse({ goal: row })
  }

  throw new Error(`rota não prevista pelo gravador: ${method} ${path}`)
}

function renderPanel(canManage: boolean) {
  return render(
    <>
      <ProjectCronogramaPanel
        projectId={PROJECT}
        canManage={canManage}
        leaderId={null}
        initialMembers={[]}
      />
      {/* Sem isto nenhum texto de toast chega ao DOM (medido no V4-5a). */}
      <Toaster />
    </>,
  )
}

beforeEach(() => {
  resetStore()
  authMocks.user = { id: 1, name: "Coordenador", email: "coord@lab.com", roles: ["COORDENADOR"] }
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

describe("checkbox de meta cumprida", () => {
  it("gestão vê o checkbox, marcado na meta cumprida, livre na meta aberta", async () => {
    renderPanel(true)
    const marked = await screen.findByRole("checkbox", { name: "Cumprir meta 1" })
    expect(marked).toHaveAttribute("aria-checked", "true")
    const open = screen.getByRole("checkbox", { name: "Cumprir meta 2" })
    expect(open).toHaveAttribute("aria-checked", "false")
  })

  it("desmarcar manda PUT { completed: false } e a linha fica aberta", async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel(true)
    const marked = await screen.findByRole("checkbox", { name: "Cumprir meta 1" })
    await user.click(marked)

    await waitFor(() => expect(marked).toHaveAttribute("aria-checked", "false"))
    expect(mocks.goals[0].completedAt).toBeNull()
    expect(mocks.goals[0].completedBy).toBeNull()
    const put = mocks.requests.find((entry) => entry.method === "PUT" && entry.path.endsWith("/completion"))
    expect(put?.json).toEqual({ completed: false })
  })

  it("marcar manda PUT { completed: true } e a linha fica cumprida com o ator", async () => {
    const user = userEvent.setup({ delay: null })
    renderPanel(true)
    const open = await screen.findByRole("checkbox", { name: "Cumprir meta 2" })
    await user.click(open)

    await waitFor(() => expect(open).toHaveAttribute("aria-checked", "true"))
    expect(mocks.goals[1].completedBy).toBe(1)
    const put = mocks.requests.find((entry) => entry.method === "PUT" && entry.path.endsWith("/completion"))
    expect(put?.json).toEqual({ completed: true })
  })

  it("quem não gerencia não vê o checkbox", async () => {
    renderPanel(false)
    expect(await screen.findByDisplayValue("Publicar artigo")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: "Cumprir meta 1" })).not.toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: "Cumprir meta 2" })).not.toBeInTheDocument()
  })

  it("recusa do servidor chega como aviso, e a linha não muda", async () => {
    mocks.refuseWrite = true
    const user = userEvent.setup({ delay: null })
    renderPanel(true)
    const open = await screen.findByRole("checkbox", { name: "Cumprir meta 2" })
    await user.click(open)

    expect(await screen.findByText("Usuário não tem permissão para gerenciar este projeto")).toBeInTheDocument()
    expect(open).toHaveAttribute("aria-checked", "false")
    expect(mocks.goals[1].completedAt).toBeNull()
  })
})
