/**
 * Leaderboard de projetos completo (pedido do dono em 2026-11-05): as peças que a aba Dashboard
 * ganhou — andamento por projeto, barra de distância ao campeão, destaque "Seu projeto" pela
 * projeção `isMember`, chip de membros, pilha de avatares no campeão, período pelo rótulo do
 * domínio (DEC-132), líder, tabela espelhada da liderança, iniciais no espaço do logo e a
 * largura da coluna de pontos.
 *
 * Os números não são inventados aqui: `projectProgress` e `monthColumnLabel` vêm das mesmas peças
 * da seção do recorte, e a ordenação é `rankProjects`. Este arquivo congela a TELA, não a regra.
 */
import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"

import { ProjectLeaderboard } from "@/components/features/project-leaderboard"

const users = [
  { id: 10, name: "Ana Prado", avatarKey: "users/10/images/avatar/a.webp" },
  { id: 11, name: "Bruno Rocha", avatarKey: null, avatar: null },
  { id: 12, name: "Carla Lima", avatarKey: null, avatar: null },
  { id: 13, name: "Dora Reis", avatarKey: null, avatar: null },
] as never[]

const champion = {
  id: 1,
  name: "Pesquisa em IA",
  subtitle: "Pesquisa aplicada",
  status: "active",
  createdAt: "2026-09-01T00:00:00.000Z",
  createdBy: 1,
  leaderId: 10,
  startDate: "2026-10-01",
  endDate: "2027-01-31",
  points: 3900,
  memberCount: 4,
  members: [{ userId: 10 }, { userId: 11 }, { userId: 12 }, { userId: 13 }],
  logoKey: "projects/1/images/logo",
  bannerKey: "projects/1/images/banner",
  isMember: true,
} as never

const second = {
  id: 2,
  name: "Sistema de Gestão",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: 1,
  leaderId: 11,
  points: 300,
  memberCount: 1,
  members: [{ userId: 10 }],
  isMember: false,
} as never

const third = {
  id: 3,
  name: "Automação",
  status: "completed",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: 1,
  leaderId: 12,
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  points: 30,
  memberCount: 2,
  members: [{ userId: 12 }, { userId: 13 }],
  isMember: false,
} as never

const fourth = {
  id: 4,
  name: "Microscopia",
  status: "active",
  createdAt: "2026-02-01T00:00:00.000Z",
  createdBy: 1,
  leaderId: 13,
  startDate: "2026-02-01",
  endDate: "2026-03-31",
  points: 10,
  memberCount: 3,
  members: [{ userId: 10 }, { userId: 11 }, { userId: 12 }],
  isMember: true,
} as never

const tasks = [
  { projectId: 1, status: "done" },
  { projectId: 1, status: "to-do" },
  { projectId: 2, status: "done" },
  { projectId: 2, status: "to-do" },
  { projectId: 2, status: "to-do" },
  { projectId: 4, status: "done" },
  { projectId: 4, status: "done" },
  { projectId: 4, status: "in-review" },
  { projectId: 4, status: "to-do" },
] as never[]

function championSection() {
  return screen.getByRole("region", { name: "Campeão dos projetos" })
}

function tableSection() {
  return screen.getByRole("region", { name: "Classificação completa de projetos" })
}

function renderBoard() {
  render(<ProjectLeaderboard projects={[champion, second, third, fourth]} tasks={tasks} users={users} onProjectSelect={() => {}} />)
}

describe("ProjectLeaderboard", () => {
  it("o campeão mostra período, membros, pilha de avatares e líder", () => {
    renderBoard()
    const section = championSection()

    expect(within(section).getByText("Campeão")).toBeVisible()
    expect(within(section).getByText("3900")).toBeVisible()
    // Rótulo do domínio (DEC-132): substring de `YYYY-MM`, nenhum `new Date` na tela.
    expect(within(section).getByText("out/2026 – jan/2027")).toBeVisible()
    expect(within(section).getByText("4 membros")).toBeVisible()
    expect(within(section).getByText("Liderado por Ana Prado")).toBeVisible()

    // Pilha: os três primeiros do vínculo, e o resto vira contador.
    expect(within(section).getByRole("img", { name: "Ana Prado" })).toBeInTheDocument()
    expect(within(section).getByText("BR")).toBeInTheDocument()
    expect(within(section).getByText("+1")).toBeInTheDocument()

    // A barra do campeão segue o mesmo andamento da seção do recorte.
    expect(within(section).getByRole("progressbar", { name: /Progresso do projeto Pesquisa em IA/ })).toBeInTheDocument()

    // "Seu projeto" vem da projeção `isMember` do servidor, não de regra nova.
    expect(within(section).getByText("Seu projeto")).toBeVisible()
  })

  it("o 2º lugar tem chip de membros e a barra de tarefas", () => {
    renderBoard()
    const section = screen.getByRole("region", { name: "Segundo e terceiro lugares" })

    expect(within(section).getByText("1 membro")).toBeVisible()
    expect(within(section).getByText("1 de 3 tarefas concluídas")).toBeVisible()
    expect(within(section).getByRole("progressbar", { name: /Progresso do projeto Sistema de Gestão/ })).toBeInTheDocument()
    expect(within(section).getByText("300")).toBeVisible()
  })

  it("a classificação completa é a tabela espelhada da liderança, com destaque do projeto do ator", () => {
    renderBoard()
    const section = tableSection()

    expect(within(section).getByRole("columnheader", { name: "Posição" })).toBeVisible()
    expect(within(section).getByRole("columnheader", { name: "Progresso" })).toBeVisible()
    expect(within(section).getByRole("columnheader", { name: "Membros" })).toBeVisible()
    expect(within(section).getByRole("columnheader", { name: "Pontos" })).toBeVisible()

    const row = screen.getByText("Microscopia").closest("tr")!
    expect(row).toHaveClass("bg-primary/5")
    expect(within(row).getByText("Seu projeto")).toBeVisible()
    // Iniciais no espaço do logo: a peça que a liderança de pessoas já usa.
    expect(within(row).getByText("M")).toBeVisible()
    expect(within(row).getByRole("cell", { name: "3" })).toBeInTheDocument()
    // Microscopia tem período: a célula de progresso é a fonte temporal, o mesmo cálculo da seção do recorte.
    expect(within(row).getByText("fev/2026 – mar/2026")).toBeVisible()
    expect(within(row).getByRole("progressbar", { name: "Progresso do projeto Microscopia: 100%" })).toBeInTheDocument()
    // A largura que "10.500" precisa.
    expect(within(row).getByRole("cell", { name: "10" })).toHaveClass("w-14")
  })

  it("recorte sem projeto é vazio declarado", () => {
    render(<ProjectLeaderboard projects={[]} tasks={[]} users={users} onProjectSelect={() => {}} />)
    expect(screen.getByText("Nenhum projeto disponível neste recorte.")).toBeVisible()
  })
})
