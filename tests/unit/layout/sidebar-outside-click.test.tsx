import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi, afterEach } from "vitest"
import { useSidebarOutsideClick } from "@/components/layout/use-sidebar-outside-click"

function SidebarFixture() {
  const [open, setOpen] = useState(true)
  const close = () => setOpen(false)
  useSidebarOutsideClick(open, close)

  return (
    <>
      <button aria-controls="primary-navigation-sidebar">Menu</button>
      <aside id="primary-navigation-sidebar" aria-label="Navegação principal" data-state={open ? "open" : "closed"}>
        <button>Encerrar sessão</button>
        <button>Responsabilidade ativa</button>
      </aside>
      <main data-testid="outside">Home</main>
    </>
  )
}

describe("sidebar outside click", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("fecha ao clicar fora, mesmo com a sessão e responsabilidade expandidas", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }))
    render(<SidebarFixture />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Responsabilidade ativa" }))
    expect(screen.getByRole("complementary")).toHaveAttribute("data-state", "open")
    fireEvent.pointerDown(screen.getByTestId("outside"))

    expect(screen.getByRole("complementary")).toHaveAttribute("data-state", "closed")
  })

  it("não fecha ao interagir com o controle do menu nem em viewport mobile", () => {
    const media = vi.fn().mockReturnValue({ matches: false })
    vi.stubGlobal("matchMedia", media)
    render(<SidebarFixture />)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Menu" }))
    expect(screen.getByRole("complementary")).toHaveAttribute("data-state", "open")
    fireEvent.pointerDown(screen.getByTestId("outside"))
    expect(screen.getByRole("complementary")).toHaveAttribute("data-state", "open")

    media.mockReturnValue({ matches: true })
    act(() => fireEvent.pointerDown(screen.getByTestId("outside")))
    expect(screen.getByRole("complementary")).toHaveAttribute("data-state", "closed")
  })
})
