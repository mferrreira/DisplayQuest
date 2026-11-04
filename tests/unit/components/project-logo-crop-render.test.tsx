/**
 * plan-v14 S01 (regra 1 do MODELO.md) — o recorte quadrado do logo é renderizado pela peça
 * única `BannerImage` nas três superfícies: cabeçalho do detalhe, cartão da lista, pódio do
 * leaderboard de projetos.
 *
 * Por que existe: o DEC-242 grava `logoCrop*` pela fábrica quadrada e o próprio comentário da
 * DEC-242 admite "a tela não aplica o corte" — as três superfícies renderizam `<img
 * object-cover>` simples. Este arquivo congela a regra: logo com recorte gravado sai pela peça
 * com o zoom das colunas; logo sem recorte fica no corte centrado de hoje (`scale(1)`), o
 * comportamento congelado da regra 1.
 *
 * Costura medida: o jsdom não dispara `onLoad` do `<img>` e o contêiner mede 0, então a peça cai
 * na variante sem medida (`bannerCropTransform`) — o `scale(<zoom>)` continua no `style` e é o
 * que se prova aqui. Os contextos de `ProjectList` são os mesmos mocks de
 * `tests/unit/components/project-list.test.tsx`; `useToast` é o shim de always-toast do
 * cabeçalho.
 */
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("@/contexts/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, name: "Ana", email: "ana@lab", roles: ["COORDENADOR"] } }),
}))

vi.mock("@/contexts/user-context", () => ({
  useUser: () => ({ users: [{ id: 1, name: "Ana", email: "ana@lab" }] }),
}))

vi.mock("@/contexts/project-context", () => ({
  useProject: () => ({ projects: [], deleteProject: vi.fn(), loading: false }),
}))

vi.mock("@/components/features/project-dialog", () => ({
  ProjectDialog: () => null,
}))

import { ProjectMediaHeader } from "@/components/features/project-media-header"
import { ProjectList } from "@/components/features/project-list"
import { ProjectLeaderboard } from "@/components/features/project-leaderboard"
import type { Project } from "@/contexts/types"

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 9,
    name: "Alpha",
    description: "Projeto de laboratório",
    createdAt: "2026-01-01T12:00:00.000Z",
    createdBy: 1,
    leaderId: 1,
    status: "active",
    links: [],
    logoKey: "projects/9/images/logo",
    bannerKey: null,
    logoCropX: 0.3,
    logoCropY: 0.3,
    logoCropZoom: 1.65,
    ...overrides,
  }
}

describe("plan-v14 S01 — o logo recortado sai pela peça única em toda superfície", () => {
  it("cabeçalho do detalhe: logo com recorte renderiza pela peça com o zoom gravado", () => {
    render(
      <ProjectMediaHeader
        projectId={9}
        projectName="Alpha"
        logoKey="projects/9/images/logo"
        bannerKey="projects/9/images/banner"
        bannerCrop={null}
        logoCrop={{ x: 0.3, y: 0.3, zoom: 1.65 }}
        canManage
      />
    )

    const logo = screen.getByRole("img", { name: "Logo do projeto Alpha" })
    expect(logo.getAttribute("src")).toContain("/api/projects/9/images/logo/file")
    expect(logo.closest('[data-banner-crop="true"]')).not.toBeNull()
    expect(logo.getAttribute("style")).toContain("scale(1.65)")
  })

  it("cartão da lista: logo com recorte renderiza pela peça, com o zoom das colunas", () => {
    render(<ProjectList projects={[makeProject()]} showCreateButton={false} />)

    const logo = screen.getByRole("img", { name: "Logo do projeto Alpha" })
    expect(logo.closest('[data-banner-crop="true"]')).not.toBeNull()
    expect(logo.getAttribute("style")).toContain("scale(1.65)")
  })

  it("cartão da lista: logo sem recorte mantém o corte centrado de hoje", () => {
    render(
      <ProjectList
        projects={[makeProject({ logoCropX: null, logoCropY: null, logoCropZoom: null })]}
        showCreateButton={false}
      />
    )

    const logo = screen.getByRole("img", { name: "Logo do projeto Alpha" })
    expect(logo.closest('[data-banner-crop="true"]')).not.toBeNull()
    expect(logo.getAttribute("style")).toContain("scale(1)")
  })

  it("pódio do leaderboard: campeão, 2º, 3º e as linhas consomem a peça com o recorte", () => {
    const projects: Project[] = [
      makeProject({ points: 100, bannerKey: "projects/9/images/banner" }),
      makeProject({
        id: 8,
        name: "Beta",
        logoKey: "projects/8/images/logo",
        logoCropX: 0.5,
        logoCropY: 0.5,
        logoCropZoom: 2.2,
        points: 50,
      }),
      makeProject({
        id: 7,
        name: "Gama",
        logoKey: "projects/7/images/logo",
        logoCropX: null,
        logoCropY: null,
        logoCropZoom: null,
        points: 30,
      }),
    ]

    render(<ProjectLeaderboard projects={projects} />)

    const champion = screen.getByRole("img", { name: "Alpha" })
    expect(champion.closest('[data-banner-crop="true"]')).not.toBeNull()
    expect(champion.getAttribute("style")).toContain("scale(1.65)")

    const runner = screen.getByRole("img", { name: "Beta" })
    expect(runner.closest('[data-banner-crop="true"]')).not.toBeNull()
    expect(runner.getAttribute("style")).toContain("scale(2.2)")

    const row = screen.getByRole("img", { name: "Gama" })
    expect(row.closest('[data-banner-crop="true"]')).not.toBeNull()
    expect(row.getAttribute("style")).toContain("scale(1)")
  })
})
