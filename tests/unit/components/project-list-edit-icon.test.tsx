/**
 * S06 (plan-v21, R10) — ícone "Editar descrição X" no card da lista de projetos.
 *
 * Por que existe: a visibilidade do ícone é a regra R9 na tela — gestão (MANAGE_PROJECTS)
 * **ou** membro ATIVO (`isMemberActive` da lista). O servidor é a autoridade; este arquivo
 * congela que o controle aparece só para quem pode, e que o dialog abre com a descrição da
 * linha. Os três contextos são dobrados na forma que `ProjectList` consome (mesma costura do
 * arquivo de cartão do plan-v11).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const authUser = { id: 1, name: "Ana", email: "ana@lab", roles: ["COORDENADOR"] }

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: authUser }),
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

import { ProjectList } from "@/components/features/project-list"
import type { Project } from "@/contexts/types"

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 9,
    name: "Alpha",
    description: "Projeto de laboratório",
    createdAt: "2026-01-01T12:00:00.000Z",
    createdBy: 2,
    leaderId: 2,
    status: "active",
    links: [],
    logoKey: null,
    bannerKey: null,
    ...overrides,
  }
}

describe("ícone de editar descrição no card", () => {
  beforeEach(() => {
    authUser.roles = ["COORDENADOR"]
    authUser.id = 1
  })

  it("gestão vê o ícone, e ele abre o dialog com a descrição da linha", async () => {
    const user = userEvent.setup({ delay: null })
    render(<ProjectList projects={[makeProject()]} showCreateButton={false} />)
    const icon = screen.getByRole("button", { name: "Editar descrição Alpha" })
    await user.click(icon)
    expect(await screen.findByRole("textbox", { name: "Descrição em markdown" })).toHaveValue("Projeto de laboratório")
  })

  it("membro ATIVO vê o ícone", () => {
    authUser.roles = ["COLABORADOR"]
    render(<ProjectList projects={[makeProject({ isMember: true, isMemberActive: true })]} showCreateButton={false} />)
    expect(screen.getByRole("button", { name: "Editar descrição Alpha" })).toBeInTheDocument()
  })

  it("membro INATIVO não vê o ícone", () => {
    authUser.roles = ["COLABORADOR"]
    render(<ProjectList projects={[makeProject({ isMember: true, isMemberActive: false })]} showCreateButton={false} />)
    expect(screen.queryByRole("button", { name: "Editar descrição Alpha" })).not.toBeInTheDocument()
  })

  it("não-membro não vê o ícone", () => {
    authUser.roles = ["COLABORADOR"]
    render(<ProjectList projects={[makeProject()]} showCreateButton={false} />)
    expect(screen.queryByRole("button", { name: "Editar descrição Alpha" })).not.toBeInTheDocument()
  })

  it("o ícone não se confunde com o botão de gestão do wizard", () => {
    authUser.roles = ["COORDENADOR"]
    render(<ProjectList projects={[makeProject()]} showCreateButton={false} />)
    // Os dois controles coexistem e os rótulos não se sobrepõem (lição da 3.C).
    expect(screen.getByRole("button", { name: "Editar projeto Alpha" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Editar descrição Alpha" })).toBeInTheDocument()
  })
})
