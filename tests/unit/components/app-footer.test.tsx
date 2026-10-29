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
  it("mostra as tres marcas (CNPq, IFNMG, Display), cada uma com a variante dos dois modos", () => {
    montar()
    for (const alt of ["CNPq", "IFNMG — Campus Januária", "Laboratório Display"]) {
      const imgs = screen.getAllByAltText(alt)
      expect(imgs).toHaveLength(2)
      const srcs = imgs.map((img) => img.getAttribute("src"))
      expect(srcs).toContainEqual(expect.stringContaining("modo-claro"))
      expect(srcs).toContainEqual(expect.stringContaining("modo-escuro"))
    }
    // A troca e CSS puro: a variante clara some no dark e a escura so aparece no dark.
    const claro = screen.getAllByAltText("CNPq").find((img) => img.getAttribute("src")?.includes("modo-claro"))!
    const escuro = screen.getAllByAltText("CNPq").find((img) => img.getAttribute("src")?.includes("modo-escuro"))!
    expect(claro.className).toContain("dark:hidden")
    expect(escuro.className).toContain("dark:block")
  })

  it("o campus correto mora no title, e nao ha texto institucional nem reserva pontilhada", () => {
    montar()
    expect(
      screen.getByTitle("Instituto Federal do Norte de Minas Gerais — Campus Januária"),
    ).toBeInTheDocument()
    const rodape = screen.getByRole("contentinfo")
    expect(within(rodape).queryByText(/Logo IFNMG/)).not.toBeInTheDocument()
    expect(within(rodape).queryByText(/Instituto Federal/)).not.toBeInTheDocument()
    expect(within(rodape).queryByText(/Campus/)).not.toBeInTheDocument()
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
