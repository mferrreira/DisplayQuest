// @vitest-environment jsdom
/**
 * plan-v13 S07 (ADR-001) — o contrato DOM do pódio glorioso.
 *
 * A cena 3D não entra no jsdom (sem WebGL de verdade aqui), então este arquivo congela o
 * outro lado da ADR-001: com WebGL, a cena ocupa a faixa do pódio e os cards viram
 * `sr-only` (teclado e leitor de tela); sem WebGL, os cards de hoje ficam visíveis e
 * servem de pódio. A "Classificação completa" é DOM nos dois casos.
 *
 * O wrapper de cena é mockado: o que se prova aqui é o acordo entre o wrapper e os cards,
 * não o WebGL.
 */
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ProjectLeaderboard } from "@/components/features/project-leaderboard"
import type { Project } from "@/contexts/types"

vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: null }) }))

const mock = vi.hoisted(() => ({ webgl: true, calls: [] as Record<string, unknown>[] }))

vi.mock("@/components/features/project-podium-3d", async () => {
  const React = await import("react")
  return {
    useWebglSupport: () => mock.webgl,
    ProjectPodium3D: (props: { entries: { project: Project }[] }) => {
      if (!mock.webgl) return null
      mock.calls.push(props)
      return React.createElement("div", {
        "data-testid": "podium-canvas",
        role: "region",
        "aria-label": "Pódio dos projetos em três dimensões",
      }, props.entries.map((e) => e.project.name))
    },
  }
})

function project(id: number, name: string, points: number, subtitle: string | null = null): Project {
  return { id, name, subtitle, description: null, createdAt: "2026-01-01", createdBy: 1, status: "active", points, logoKey: null, bannerKey: null }
}

const P1 = project(1, "Pesquisa em IA", 30, "Bolsa de pesquisa")
const P2 = project(2, "Automação", 20)
const P3 = project(3, "Microscopia", 10)
const P4 = project(4, "Sem saldo", 0, "Iniciação junior")

describe("ProjectLeaderboard com pódio glorioso", () => {
  it("com WebGL: a cena ocupa a faixa do pódio e os cards ficam sr-only, preservando as regiões de hoje", () => {
    mock.webgl = true
    const opened: number[] = []
    render(<ProjectLeaderboard projects={[P3, P2, P1, P4]} onProjectSelect={(p) => opened.push(p.id)} />)

    const canvasRegion = screen.getByRole("region", { name: "Pódio dos projetos em três dimensões" })
    expect(canvasRegion).toHaveTextContent("Pesquisa em IA")

    const champion = screen.getByRole("region", { name: "Campeão dos projetos" })
    expect(champion.className).toContain("sr-only")
    expect(champion).toHaveTextContent("Campeão")

    fireEvent.click(champion.querySelector("a")!)
    expect(opened).toEqual([1])
    const runners = screen.getByRole("region", { name: "Segundo e terceiro lugares" })
    fireEvent.click(runners.querySelectorAll("a")[1])
    expect(opened).toEqual([1, 3])
  })

  it("sem WebGL: nenhum canvas, os cards de hoje ficam visíveis e servem de pódio", () => {
    mock.webgl = false
    render(<ProjectLeaderboard projects={[P1, P2, P3, P4]} onProjectSelect={() => {}} />)

    expect(screen.queryByRole("region", { name: "Pódio dos projetos em três dimensões" })).not.toBeInTheDocument()
    const champion = screen.getByRole("region", { name: "Campeão dos projetos" })
    expect(champion.className).not.toContain("sr-only")
    expect(champion).toHaveTextContent("30")
    expect(screen.getByRole("region", { name: "Segundo e terceiro lugares" })).toHaveTextContent("Automação")
  })

  it("a classificação completa segue DOM nos dois casos, começando no 4º", () => {
    for (const webgl of [true, false]) {
      mock.webgl = webgl
      const { unmount } = render(<ProjectLeaderboard projects={[P1, P2, P3, P4]} onProjectSelect={() => {}} />)
      const rows = screen.getByRole("region", { name: /Classificação/ })
      expect(rows.textContent).toContain("4º")
      expect(rows.textContent).toContain("Sem saldo")
      expect(rows.textContent).not.toContain("Pesquisa em IA")
      unmount()
    }
  })

  it("recorte vazio: nenhum pódio e nenhum canvas", () => {
    mock.webgl = true
    render(<ProjectLeaderboard projects={[]} onProjectSelect={() => {}} />)
    expect(screen.queryByRole("region", { name: "Campeão dos projetos" })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Pódio dos projetos em três dimensões" })).not.toBeInTheDocument()
    expect(screen.getByText(/Nenhum projeto/)).toBeInTheDocument()
  })

  it("o wrapper da cena recebe os três do pódio na ordem do ranking, com a distância até o próximo lugar", () => {
    mock.webgl = true
    mock.calls.length = 0
    render(<ProjectLeaderboard projects={[P3, P2, P1, P4]} onProjectSelect={() => {}} />)
    const last = mock.calls[mock.calls.length - 1] as { entries: { project: Project; distanceText: string | null }[] }
    expect(last.entries.map((e) => e.project.name)).toEqual(["Pesquisa em IA", "Automação", "Microscopia"])
    expect(last.entries.map((e) => e.distanceText)).toEqual([null, "10 pts para o 1º", "10 pts para o 2º"])
  })

  it("sem WebGL: a distância aparece nos cards visíveis", () => {
    mock.webgl = false
    render(<ProjectLeaderboard projects={[P1, P2, P3, P4]} onProjectSelect={() => {}} />)
    const runners = screen.getByRole("region", { name: "Segundo e terceiro lugares" })
    expect(runners).toHaveTextContent("10 pts para o 1º")
    expect(runners).toHaveTextContent("10 pts para o 2º")
  })
})
