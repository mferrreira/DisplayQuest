/**
 * S01 (plan-v12, R1/R3, DEC-238) — leitura da fila de conclusões solicitadas para o painel.
 *
 * Por que existe: aprovar conclusão exige entrar no projeto e abrir a linha do cronograma.
 * A fila global do painel é LEITURA sobre o port de conclusão estendido, gateada por
 * `DASHBOARD_ADMIN` — o MESMO conjunto dos aprovadores globais (nenhuma chave nova nas
 * matrizes). O prêmio previsto é a MESMA função da economia, com `approvedDay` do dia
 * (preview, não escrita).
 *
 * O que este arquivo congela:
 *   1. O gate: só `COORDENADOR`/`GERENTE` (DASHBOARD_ADMIN); VOLUNTARIO e GERENTE_PROJETO
 *      recebem Forbidden com a frase congelada.
 *   2. A ordem das linhas: projeto ascendente, `order` ascendente.
 *   3. O prêmio previsto: antecipada ≥2 dias → base×1,5; atraso com piso 0 — as funções
 *      `activityReward`/`activityPeriod`/`activityCompletionAward` do domínio, com `now` do
 *      chamador (DEC-132).
 *   4. Nome do projeto e de quem pediu passam por inteiro; `requestedBy` null (SetNull,
 *      DEC-155) chega null.
 */
import { describe, expect, it } from "vitest";

import { ForbiddenError, userActor, COMPLETION_QUEUE_DENIED_MESSAGE } from "@/backend/domain"
import { ListCompletionRequestsForActorUseCase } from "@/backend/modules/project-management/application/use-cases/list-completion-requests-for-actor.use-case"
import type {
  CompletionRequestRecord,
  ProjectCompletionRequestsPort,
} from "@/backend/modules/project-management/application/ports/project-completion-requests.port"

const NOW = new Date("2026-11-03T12:00:00Z")

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

function useCaseWith(rows: CompletionRequestRecord[]): ListCompletionRequestsForActorUseCase {
  const port: ProjectCompletionRequestsPort = {
    listProjectIdsWithRequests: async () => [...new Set(rows.map((r) => r.projectId))],
    listCompletionRequests: async () => rows,
  }
  return new ListCompletionRequestsForActorUseCase({ completionRequests: port })
}

describe("fila de conclusões solicitadas — gate de leitura (DEC-238)", () => {
  it("VOLUNTARIO recebe Forbidden com a frase congelada", async () => {
    const uc = useCaseWith([row({ projectId: 10, activityId: 1 })])
    await expect(uc.execute({ actor: userActor(4, ["VOLUNTARIO"]), now: NOW }))
      .rejects.toThrow(COMPLETION_QUEUE_DENIED_MESSAGE)
    await expect(uc.execute({ actor: userActor(4, ["VOLUNTARIO"]), now: NOW }))
      .rejects.toBeInstanceOf(ForbiddenError)
  })

  it("GERENTE_PROJETO não vê a fila global: gerencia a grade, não aprova conclusão global", async () => {
    const uc = useCaseWith([row({ projectId: 10, activityId: 1 })])
    await expect(uc.execute({ actor: userActor(3, ["GERENTE_PROJETO"]), now: NOW }))
      .rejects.toThrow(COMPLETION_QUEUE_DENIED_MESSAGE)
  })

  it("COORDENADOR e GERENTE entram", async () => {
    const rows = [row({ projectId: 10, activityId: 1 })]
    const uc = useCaseWith(rows)
    const asCoord = await uc.execute({ actor: userActor(1, ["COORDENADOR"]), now: NOW })
    const asGerente = await uc.execute({ actor: userActor(5, ["GERENTE"]), now: NOW })
    expect(asCoord).toHaveLength(1)
    expect(asGerente).toHaveLength(1)
  })
})

describe("fila de conclusões — linhas e prêmio previsto", () => {
  it("ordem por projeto e `order`, campos passados por inteiro", async () => {
    const uc = useCaseWith([
      row({ projectId: 12, activityId: 4, order: 2, projectName: "Segundo projeto", firstMonth: "2026-10", lastMonth: "2026-10", requestedBy: null, requestedByName: null, requestedAt: null }),
      row({ projectId: 10, activityId: 1, order: 1 }),
      row({ projectId: 10, activityId: 2, order: 2, description: "Etapa 2", firstMonth: "2026-11", lastMonth: "2026-11" }),
    ])
    const rows = await uc.execute({ actor: userActor(1, ["COORDENADOR"]), now: NOW })
    expect(rows.map((r) => r.activityId)).toEqual([1, 2, 4])
    expect(rows[0]).toMatchObject({
      projectId: 10,
      projectName: "Pesquisa em IA",
      order: 1,
      description: "Etapa 1",
      periodoInicio: "2026-04-01",
      periodoFim: "2026-06-30",
      requestedBy: 2,
      requestedByName: "Lívia",
      requestedAt: "2026-06-20T12:00:00.000Z",
    })
    expect(rows[1]).toMatchObject({ periodoInicio: "2026-11-01", periodoFim: "2026-11-30" })
    expect(rows[2]).toMatchObject({ requestedBy: null, requestedByName: null, requestedAt: null })
  })

  it("prêmio previsto pela mesma função da economia, com o dia do `now`: antecipada ×1,5, atraso com piso 0", async () => {
    const uc = useCaseWith([
      // base 300, fim 2026-06-30, aprovação em 2026-11-03 → atraso 126 dias → piso 0.
      row({ projectId: 10, activityId: 1 }),
      // base 100, fim 2026-10-31, aprovação em 2026-11-03 → atraso 3 dias → 100 - 30 = 70.
      row({ projectId: 12, activityId: 4, order: 2, firstMonth: "2026-10", lastMonth: "2026-10" }),
      // base 100, fim 2026-11-30, aprovação em 2026-11-03 → antecipada 27 dias → 150.
      row({ projectId: 13, activityId: 7, order: 1, firstMonth: "2026-11", lastMonth: "2026-11" }),
    ])
    const rows = await uc.execute({ actor: userActor(1, ["COORDENADOR"]), now: NOW })
    expect(rows[0].award).toBe(0)
    expect(rows[1].award).toBe(70)
    expect(rows[2].award).toBe(150)
  })
})
