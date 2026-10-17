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
  it("mostra a marca do Laboratório Display (LOGO.png real) e a reserva do IFNMG", () => {
    montar()
    expect(screen.getByAltText("Laboratório Display")).toHaveAttribute("src", "/LOGO.png")
    const rodape = screen.getByRole("contentinfo")
    expect(screen.getByText("Logo IFNMG")).toBeInTheDocument()
    expect(within(rodape).getByText(/Instituto Federal do Norte de Minas Gerais/)).toBeInTheDocument()
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
