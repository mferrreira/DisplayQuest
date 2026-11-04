/**
 * plan-v14 S01 — o zod do projeto preserva as tuplas de recorte.
 *
 * Por que existe: o zod STRIPPA chave desconhecida. `entities/project.ts` não tinha as seis
 * colunas de recorte (DEC-241/242), então o `project` que a página do detalhe recebe de
 * `projectsApi.getById` chegava sem elas — `bannerCropFromColumns(undefined)` dava null e o
 * cabeçalho renderizava `scale(1)` com recorte gravado no banco. O docker mediu isto em
 * 2026-11-04: a lista (que não usa zod) mostrava o corte, o detalhe não. Este arquivo congela
 * o parse da rota `GET /api/projects/[id]` com as colunas presentes.
 */
import { describe, expect, it } from "vitest"
import { projectSchema } from "@/entities/project"

const payload = {
  id: 1,
  name: "Sistema de Gestão de Laboratório",
  description: null,
  createdAt: "2026-10-26T15:09:20.892Z",
  createdBy: 1,
  leaderId: 1,
  status: "active",
  links: null,
  startDate: null,
  endDate: null,
  editalNumber: null,
  processNumber: null,
  proppiNumber: null,
  points: 300,
  logoKey: "projects/1/images/logo/431ff612.webp",
  bannerKey: "projects/1/images/banner/f3eb438b.webp",
  bannerCropX: 0.5,
  bannerCropY: 0.5,
  bannerCropZoom: 2.576896416623974,
  logoCropX: 0.3028133186751499,
  logoCropY: 0.3028133186751499,
  logoCropZoom: 1.651182326416715,
}

describe("plan-v14 S01 — projectSchema preserva as tuplas de recorte", () => {
  it("parse da rota preserva as seis colunas de recorte", () => {
    const parsed = projectSchema.parse(payload)
    expect(parsed.bannerCropX).toBe(0.5)
    expect(parsed.bannerCropY).toBe(0.5)
    expect(parsed.bannerCropZoom).toBe(2.576896416623974)
    expect(parsed.logoCropX).toBe(0.3028133186751499)
    expect(parsed.logoCropY).toBe(0.3028133186751499)
    expect(parsed.logoCropZoom).toBe(1.651182326416715)
  })

  it("parse sem recorte mantém null nas colunas", () => {
    const parsed = projectSchema.parse({ ...payload, logoKey: null, bannerKey: null, bannerCropX: null, bannerCropY: null, bannerCropZoom: null, logoCropX: null, logoCropY: null, logoCropZoom: null })
    expect(parsed.logoCropX).toBeNull()
    expect(parsed.logoCropZoom).toBeNull()
  })
})
