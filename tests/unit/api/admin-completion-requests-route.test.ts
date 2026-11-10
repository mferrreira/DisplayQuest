// @vitest-environment node
/**
 * S01 (plan-v12, R3, DEC-238) — rota de leitura da fila de conclusões para o painel.
 *
 * O módulo é REAL sobre portas falsas (lição do B6-2a: um duplo do módulo inteiro faz o 403
 * sumir do teste em vez de falhar). Só a sessão é dobrada. O que este arquivo congela:
 *   1. 401 antes de tudo.
 *   2. O gate do use case na rota: VOLUNTARIO e GERENTE_PROJETO recebem 403 com a frase do
 *      domínio; COORDENADOR e GERENTE entram (DASHBOARD_ADMIN = aprovadores, DEC-238).
 *   3. O payload: `{ requests }` com as linhas ordenadas e o prêmio previsto pelo `now` da
 *      rota — as funções do domínio, não uma fórmula da rota.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { createIdentityAccessModule } from "@/backend/modules/identity-access"
import { createProjectManagementModule } from "@/backend/modules/project-management"
import type {
  CompletionRequestRecord,
  ProjectCompletionRequestsPort,
} from "@/backend/modules/project-management/application/ports/project-completion-requests.port"

const mocks = vi.hoisted(() => ({
  session: null as null | { id: number; email: string; name: string; roles: string[]; status: string },
  rows: [] as CompletionRequestRecord[],
}))

function row(overrides: Partial<CompletionRequestRecord> & { projectId: number; activityId: number }): CompletionRequestRecord {
  return {
    projectName: "Pesquisa em IA",
    order: 1,
    description: "Etapa 1",
    firstMonth: "2026-04",
    lastMonth: "2026-06",
    requestedBy: 2,
    requestedByName: "Lívia",
    requestedAt: "2026-06-20T12:00:00.000Z",
    ...overrides,
  }
}

vi.mock("@/backend/composition/root", () => {
  const completionRequests: ProjectCompletionRequestsPort = {
    async listProjectIdsWithRequests() {
      return [...new Set(mocks.rows.map((r) => r.projectId))]
    },
    async listCompletionRequests() {
      return mocks.rows
    },
  }
  return {
    getBackendComposition: () => ({
      identityAccess: createIdentityAccessModule(),
      projectManagement: createProjectManagementModule({ ports: { completionRequests } }),
    }),
  }
})

vi.mock("@/lib/auth/server-auth", () => ({
  requireAuth: async () =>
    mocks.session === null
      ? {
          user: null,
          error: new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 }),
        }
      : { user: mocks.session },
}))

import { GET as LIST_REQUESTS } from "@/app/api/admin/completion-requests/route"

function login(roles: string[], id: number) {
  mocks.session = { id, email: "user@lab.com", name: "Usuário", roles, status: "active" }
}

function read(response: Response) {
  return response.json()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-03T12:00:00Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET /api/admin/completion-requests", () => {
  it("401 antes do gate", async () => {
    mocks.session = null
    mocks.rows = []
    const response = await LIST_REQUESTS()
    expect(response.status).toBe(401)
  })

  it("VOLUNTARIO recebe 403 com a frase do domínio", async () => {
    login(["VOLUNTARIO"], 4)
    mocks.rows = [row({ projectId: 10, activityId: 1 })]
    const response = await LIST_REQUESTS()
    expect(response.status).toBe(403)
    expect(await read(response)).toMatchObject({
      error: "Você não tem permissão para ver as conclusões solicitadas",
    })
  })

  it("GERENTE_PROJETO não vê a fila global", async () => {
    login(["GERENTE_PROJETO"], 3)
    const response = await LIST_REQUESTS()
    expect(response.status).toBe(403)
  })

  it("COORDENADOR recebe as linhas com o prêmio previsto pelo `now` da rota", async () => {
    login(["COORDENADOR"], 1)
    mocks.rows = [
      row({ projectId: 10, activityId: 1 }),
      row({ projectId: 12, activityId: 4, order: 2, firstMonth: "2026-10", lastMonth: "2026-10", requestedBy: null, requestedByName: null, requestedAt: null }),
      row({ projectId: 13, activityId: 7, order: 1, firstMonth: "2026-11", lastMonth: "2026-11" }),
    ]
    const response = await LIST_REQUESTS()
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.requests.map((r: any) => r.activityId)).toEqual([1, 4, 7])
    expect(body.requests).toEqual([
      expect.objectContaining({
        projectId: 10,
        projectName: "Pesquisa em IA",
        activityId: 1,
        order: 1,
        description: "Etapa 1",
        periodoInicio: "2026-04-01",
        periodoFim: "2026-06-30",
        requestedBy: 2,
        requestedByName: "Lívia",
        award: 0,
      }),
      expect.objectContaining({ projectId: 12, activityId: 4, periodoFim: "2026-10-31", requestedBy: null, award: 70 }),
      expect.objectContaining({ projectId: 13, activityId: 7, periodoFim: "2026-11-30", award: 150 }),
    ])
  })

  it("GERENTE entra, e a fila é a mesma", async () => {
    login(["GERENTE"], 5)
    mocks.rows = [row({ projectId: 10, activityId: 1 })]
    const response = await LIST_REQUESTS()
    expect(response.status).toBe(200)
    const body = await read(response)
    expect(body.requests).toHaveLength(1)
  })
})
