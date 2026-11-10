/**
 * S04 (plan-v21, DEC-259) — regra do vínculo entregável↔meta.
 *
 * A regra é pura: meta de OUTRO projeto não entra. A mesma frase para meta inexistente e meta
 * de fora, porque a tela não pode distinguir "sumiu" de "é de outro dono" sem virar regra em
 * duas cópias. Meta nula é meta normal — entregável sem meta é entregável legítimo.
 */
import { describe, expect, it } from "vitest"

import { DELIVERABLE_GOAL_LINK_MESSAGE, deliverableGoalLinkError } from "@/backend/domain"

describe("vínculo entregável ↔ meta", () => {
  it("meta do mesmo projeto não gera erro", () => {
    expect(deliverableGoalLinkError({ goalProjectId: 10, projectId: 10 })).toBeNull()
  })

  it("meta de outro projeto gera a frase congelada", () => {
    expect(deliverableGoalLinkError({ goalProjectId: 20, projectId: 10 })).toBe(DELIVERABLE_GOAL_LINK_MESSAGE)
    expect(DELIVERABLE_GOAL_LINK_MESSAGE).toBe("Meta não pertence a este projeto")
  })
})
