import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { UserPicker } from "@/components/ui/user-picker"

const USERS = [
  { id: 1, name: "Ana Souza", email: "ana@lab.com" },
  { id: 2, name: "Bruno Lima", email: "bruno@lab.com" },
  { id: 3, name: "Célia Nunes", email: "celia@lab.com" },
]

describe("UserPicker", () => {
  it("abre com o placeholder e mostra todos os usuários", async () => {
    const user = userEvent.setup()
    render(<UserPicker users={USERS} value="" onValueChange={() => {}} />)

    expect(screen.getByRole("combobox", { name: "Escolha um usuário" })).toHaveTextContent(
      "Escolha um usuário",
    )

    await user.click(screen.getByRole("combobox"))

    expect(screen.getByRole("listbox")).toBeInTheDocument()
    expect(screen.getAllByRole("option")).toHaveLength(3)
  })

  it("filtra por nome, ignorando maiúsculas e acentos", async () => {
    const user = userEvent.setup()
    render(<UserPicker users={USERS} value="" onValueChange={() => {}} />)

    await user.click(screen.getByRole("combobox"))
    await user.type(screen.getByRole("textbox"), "cel")

    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(1)
    expect(options[0]).toHaveTextContent("Célia Nunes")
  })

  it("filtra por e-mail", async () => {
    const user = userEvent.setup()
    render(<UserPicker users={USERS} value="" onValueChange={() => {}} />)

    await user.click(screen.getByRole("combobox"))
    await user.type(screen.getByRole("textbox"), "bruno@")

    expect(screen.getAllByRole("option")).toHaveLength(1)
    expect(screen.getByRole("option")).toHaveTextContent("Bruno Lima")
  })

  it("sem resultado, avisa em vez de mostrar lista vazia", async () => {
    const user = userEvent.setup()
    render(<UserPicker users={USERS} value="" onValueChange={() => {}} />)

    await user.click(screen.getByRole("combobox"))
    await user.type(screen.getByRole("textbox"), "zzz")

    expect(screen.queryAllByRole("option")).toHaveLength(0)
    expect(screen.getByText("Nenhum usuário encontrado.")).toBeInTheDocument()
  })

  it("escolher devolve o id e fecha o dropdown", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<UserPicker users={USERS} value="" onValueChange={onValueChange} />)

    await user.click(screen.getByRole("combobox"))
    await user.click(screen.getByText("Ana Souza"))

    expect(onValueChange).toHaveBeenCalledWith("1")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("mostra o usuário escolhido no gatilho e o marca na lista", async () => {
    const user = userEvent.setup()
    render(<UserPicker users={USERS} value="2" onValueChange={() => {}} />)

    expect(screen.getByRole("combobox", { name: /usuário selecionado/i })).toHaveTextContent(
      "Bruno Lima",
    )

    await user.click(screen.getByRole("combobox"))

    const options = screen.getAllByRole("option")
    expect(options[1]).toHaveAttribute("aria-selected", "true")
    expect(options[0]).toHaveAttribute("aria-selected", "false")
  })

  it("Enter escolhe o primeiro resultado da busca", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<UserPicker users={USERS} value="" onValueChange={onValueChange} />)

    await user.click(screen.getByRole("combobox"))
    await user.type(screen.getByRole("textbox"), "ana{Enter}")

    expect(onValueChange).toHaveBeenCalledWith("1")
  })

  it("desabilitado não abre", async () => {
    const user = userEvent.setup()
    render(<UserPicker users={USERS} value="" onValueChange={() => {}} disabled />)

    await user.click(screen.getByRole("combobox"))

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })
})
