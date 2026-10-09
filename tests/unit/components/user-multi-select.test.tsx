import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { UserMultiSelect } from "@/components/ui/user-multi-select"

const USERS = [
  { id: 1, name: "Ana Souza", email: "ana@lab.com" },
  { id: 2, name: "Bruno Lima", email: "bruno@lab.com" },
  { id: 3, name: "Célia Nunes", email: "celia@lab.com" },
]

function renderSelect(selected = new Set<number>()) {
  const onChange = vi.fn()
  render(<UserMultiSelect users={USERS} selected={selected} onChange={onChange} />)
  return { onChange }
}

describe("UserMultiSelect", () => {
  it("com conjunto vazio, o gatilho anuncia todos e 'Todos' vem marcado", async () => {
    const user = userEvent.setup()
    renderSelect()

    const trigger = screen.getByRole("button", { name: /membros visíveis na grade/i })
    expect(trigger).toHaveTextContent("(todos)")

    await user.click(trigger)

    expect(screen.getByRole("checkbox", { name: "Todos" })).toBeChecked()
    expect(screen.getAllByRole("checkbox")).toHaveLength(4) // Todos + 3 usuários
  })

  it("marcar um usuário devolve o conjunto com aquele id", async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect()

    await user.click(screen.getByRole("button", { name: /membros visíveis/i }))
    await user.click(screen.getByRole("checkbox", { name: /Ana Souza/ }))

    expect(onChange).toHaveBeenCalledWith(new Set([1]))
  })

  it("desmarcar quem estava selecionado sai do conjunto", async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect(new Set([1, 2]))

    await user.click(screen.getByRole("button", { name: /membros visíveis/i }))
    expect(screen.getByRole("button", { name: /membros visíveis/i })).toHaveTextContent(
      "(2 de 3)",
    )

    await user.click(screen.getByRole("checkbox", { name: /Bruno Lima/ }))

    expect(onChange).toHaveBeenCalledWith(new Set([1]))
  })

  it("a linha 'Todos' limpa a seleção", async () => {
    const user = userEvent.setup()
    const { onChange } = renderSelect(new Set([1]))

    await user.click(screen.getByRole("button", { name: /membros visíveis/i }))
    await user.click(screen.getByRole("checkbox", { name: "Todos" }))

    expect(onChange).toHaveBeenCalledWith(new Set())
  })

  it("a busca filtra por nome, ignorando maiúsculas e acentos", async () => {
    const user = userEvent.setup()
    renderSelect()

    await user.click(screen.getByRole("button", { name: /membros visíveis/i }))
    await user.type(screen.getByRole("textbox", { name: /buscar membro/i }), "CEL")

    const checkboxes = screen.getAllByRole("checkbox")
    expect(checkboxes).toHaveLength(2) // Todos + Célia
    expect(screen.getByRole("checkbox", { name: /Célia Nunes/ })).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: /Ana Souza/ })).not.toBeInTheDocument()
  })

  it("busca sem resultado avisa, e a lista de usuários Some", async () => {
    const user = userEvent.setup()
    renderSelect()

    await user.click(screen.getByRole("button", { name: /membros visíveis/i }))
    await user.type(screen.getByRole("textbox", { name: /buscar membro/i }), "zzz")

    expect(screen.getByText("Nenhum membro encontrado.")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Todos" })).toBeInTheDocument()
  })

  it("o dropdown continua aberto depois de marcar (multisseleção)", async () => {
    const user = userEvent.setup()
    renderSelect()

    await user.click(screen.getByRole("button", { name: /membros visíveis/i }))
    await user.click(screen.getByRole("checkbox", { name: /Ana Souza/ }))

    expect(screen.getByRole("checkbox", { name: /Bruno Lima/ })).toBeInTheDocument()
  })

  it("o marcador de 'sem horário' aparece ao lado de quem não tem grade", async () => {
    const user = userEvent.setup()
    render(
      <UserMultiSelect
        users={USERS}
        selected={new Set()}
        onChange={() => {}}
        tagFor={(u) => (u.id === 3 ? "sem horário" : undefined)}
      />,
    )

    await user.click(screen.getByRole("button", { name: /membros visíveis/i }))

    expect(screen.getByText("sem horário")).toBeInTheDocument()
  })
})
