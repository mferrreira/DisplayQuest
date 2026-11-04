/**
 * plan-v14 S05 (regra 5) — o clique na faixa da capa ou no logo abre a lista de opções, no
 * cabeçalho de mídia do projeto e do perfil.
 *
 * Por que existe: os controles de imagem eram botões visíveis amontoados abaixo da faixa; o dono
 * pediu que o clique na própria capa/logo abra a lista de opções, pelos mesmos rótulos, mesmas
 * rotas, mesma autorização. Este arquivo congela:
 *  - o gatilho é a faixa (e o logo, no projeto), não um botão separado;
 *  - o menu só existe para quem gerencia o projeto (`canManage`) e para o dono em modo de edição
 *    (`canEdit`) — a mesma regra de hoje, só mudou o lugar do controle;
 *  - os itens têm os MESMOS rótulos dos botões de hoje e a mesma condição de existência
 *    ("Recortar"/"Tirar" só quando há chave);
 *  - `Escape` fecha o menu.
 *
 * Costuras medidas da casa: o Select/DropdownMenu do Radix exige os shims de `tests/setup.ts`
 * (hasPointerCapture, ResizeObserver); a lista de itens chega um frame depois no jsdom, e
 * selecionar item com `fireEvent.click` é o caminho que já provou no painel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ProjectMediaHeader } from "@/components/features/project-media-header"
import { UserMediaHeader } from "@/components/features/user-media-header"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("cabeçalho de mídia do projeto — menu de opções no clique", () => {
  function renderProject(canManage: boolean, bannerKey: string | null = "projects/3/images/banner/a.webp", logoKey: string | null = "projects/3/images/logo/l.webp") {
    render(
      <ProjectMediaHeader
        projectId={3}
        projectName="Alpha"
        bannerKey={bannerKey}
        logoKey={logoKey}
        canManage={canManage}
      />
    )
  }

  it("quem gerencia: clique na faixa abre o menu com os mesmos rótulos de hoje", async () => {
    const user = userEvent.setup({ delay: null })
    renderProject(true)

    await user.click(screen.getByRole("button", { name: "Opções da capa do projeto" }))

    const items = await waitFor(() => screen.getAllByRole("menuitem"))
    const names = items.map((i) => i.textContent)
    expect(names).toContain("Enviar capa")
    expect(names).toContain("Recortar capa")
    expect(names).toContain("Tirar capa")
    // Os botões visíveis de hoje saíram do DOM — os controles viraram itens do menu.
    expect(screen.queryByRole("button", { name: "Enviar capa" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Recortar capa" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Tirar capa" })).not.toBeInTheDocument()
  })

  it("quem gerencia: clique no logo abre o menu do logo com os mesmos rótulos", async () => {
    const user = userEvent.setup({ delay: null })
    renderProject(true)

    await user.click(screen.getByRole("button", { name: "Opções do logo do projeto" }))

    const names = (await screen.getAllByRole("menuitem")).map((i) => i.textContent)
    expect(names).toContain("Enviar logo")
    expect(names).toContain("Recortar logo")
    expect(names).toContain("Tirar logo")
  })

  it("sem capa, o menu da capa só tem enviar — nada a recortar nem a tirar", async () => {
    const user = userEvent.setup({ delay: null })
    renderProject(true, null)

    await user.click(screen.getByRole("button", { name: "Opções da capa do projeto" }))

    const names = (await screen.getAllByRole("menuitem")).map((i) => i.textContent)
    expect(names).toContain("Enviar capa")
    expect(names).not.toContain("Recortar capa")
    expect(names).not.toContain("Tirar capa")
  })

  it("quem não gerencia: nenhum gatilho de menu existe", () => {
    renderProject(false)
    expect(screen.queryByRole("button", { name: "Opções da capa do projeto" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Opções do logo do projeto" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Enviar capa" })).not.toBeInTheDocument()
  })

  it("Escape fecha o menu", async () => {
    const user = userEvent.setup({ delay: null })
    renderProject(true)

    await user.click(screen.getByRole("button", { name: "Opções da capa do projeto" }))
    await screen.findByRole("menu")
    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())
  })
})

describe("cabeçalho de mídia do perfil — menu só em modo de edição", () => {
  function renderProfile(canEdit: boolean, bannerKey: string | null = "users/7/images/banner/a.webp", avatarKey: string | null = "users/7/images/avatar/a.webp") {
    render(
      <UserMediaHeader
        userId={7}
        userName="Ana"
        bannerKey={bannerKey}
        avatarKey={avatarKey}
        canEdit={canEdit}
        onBannerChange={vi.fn()}
      />
    )
  }

  it("em edição: clique na faixa abre o menu com os mesmos rótulos de hoje", async () => {
    const user = userEvent.setup({ delay: null })
    renderProfile(true)

    await user.click(screen.getByRole("button", { name: "Opções da capa do perfil" }))

    const names = (await screen.getAllByRole("menuitem")).map((i) => i.textContent)
    expect(names).toContain("Enviar capa")
    expect(names).toContain("Recortar capa")
    expect(names).toContain("Tirar capa")
    expect(names).toContain("Enviar avatar")
    expect(names).toContain("Recortar avatar")
    expect(names).toContain("Tirar avatar")
    expect(screen.queryByRole("button", { name: "Enviar capa" })).not.toBeInTheDocument()
  })

  it("fora do modo de edição: nenhum gatilho, nenhum controle", () => {
    renderProfile(false)
    expect(screen.queryByRole("button", { name: "Opções da capa do perfil" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Enviar capa" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Tirar capa" })).not.toBeInTheDocument()
  })
})
