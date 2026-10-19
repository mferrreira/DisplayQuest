import { describe, expect, it } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { SessionProvider } from "next-auth/react"

import { AppFooter } from "@/components/layout/app-footer"

function montar() {
  return render(
    <SessionProvider session={{ user: {} } as never}>
      <AppFooter />
    </SessionProvider>,
  )
}

describe("AppFooter (plan-v6, pedido do dono)", () => {
  it("mostra APENAS as duas marcas: LOGO.png real e a reserva do IFNMG, sem texto institucional", () => {
    montar()
    expect(screen.getByAltText("Laboratório Display")).toHaveAttribute("src", "/LOGO.png")
    expect(screen.getByText("Logo IFNMG")).toBeInTheDocument()
    // O campus correto (Januária, não Salinas) mora no title, não em texto visível.
    expect(
      screen.getByTitle("Instituto Federal do Norte de Minas Gerais — Campus Januária"),
    ).toBeInTheDocument()
    // Versão discreta (dono, V6-11k): o nome da marca e o texto do instituto saíram.
    const rodape = screen.getByRole("contentinfo")
    expect(within(rodape).queryByText(/Laboratório Display/)).not.toBeInTheDocument()
    expect(within(rodape).queryByText(/Instituto Federal/)).not.toBeInTheDocument()
  })

  it("dá o crédito ao desenvolvedor", () => {
    montar()
    expect(screen.getByText(/Márcio Martins Ferreira Júnior/)).toBeInTheDocument()
  })

  it("esconde na impressão (rotas /print exportam PDF sem chrome institucional)", () => {
    const { container } = montar()
    expect(container.querySelector("footer")).toHaveClass("print:hidden")
  })
})
