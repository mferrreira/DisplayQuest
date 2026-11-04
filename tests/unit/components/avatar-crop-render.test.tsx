/**
 * plan-v14 S02 (regra 2) — o avatar da pessoa sai pela peça única `BannerImage` com o
 * recorte quadrado quando `avatarKey` existe; sem chave, cai no legado `user.avatar` de hoje.
 *
 * Por que existe: a DEC-242 pôs o avatar no bucket e grava `logoCrop*`, e o próprio comentário
 * dela admite "O render do avatar continua cover simples — a tela não aplica o corte". Medido no
 * docker em 2026-11-04: o upload pelo editor quadrado chega ao bucket e grava a chave, mas o
 * perfil mostra as iniciais (`users.avatar` legado vazio) e o zod do usuário STRIPPA as
 * colunas, então nenhuma superfície tem a chave para renderizar. Este arquivo congela a peça
 * e o pódio, onde a regra 2 exige `avatarKey` + crop.
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { AvatarCrop } from "@/components/ui/avatar-crop"
import { LeaderboardPodium } from "@/components/leaderboard/leaderboard-podium"

describe("plan-v14 S02 — avatar recortado pela peça única", () => {
  it("com avatarKey, o avatar consome a peça com o zoom gravado", () => {
    render(
      <AvatarCrop
        userId={1}
        avatarKey="users/1/images/avatar/x.webp"
        crop={{ x: 0.5, y: 0.5, zoom: 1.8333333 }}
        legacyAvatar={null}
        name="Coordenador"
        fallback="CO"
        className="h-14 w-14"
      />,
    )

    const img = screen.getByRole("img", { name: "Coordenador" })
    expect(img.getAttribute("src")).toContain("/api/users/1/images/avatar/file")
    expect(img.closest('[data-banner-crop="true"]')).not.toBeNull()
    expect(img.getAttribute("style")).toContain("scale(1.8333333)")
  })

  it("sem avatarKey, o avatar cai no legado de hoje, sem peça", () => {
    const { container } = render(
      <AvatarCrop
        userId={1}
        avatarKey={null}
        crop={null}
        legacyAvatar="/api/uploads/avatars/1.webp"
        name="Coordenador"
        fallback="CO"
        className="h-14 w-14"
      />,
    )

    // jsdom não carrega a imagem do Radix (`onLoadingStatus` nunca vira `loaded`), então o
    // slot do legado se prova pelo fallback de iniciais — mesma costura medida do teste do
    // pódio. O que importa aqui: nenhuma peça de recorte foi montada.
    expect(screen.getByText("CO")).toBeInTheDocument()
    expect(container.querySelector('[data-banner-crop="true"]')).toBeNull()
  })

  it("pódio do quadro: campeão e 2º/3º com avatarKey consomem a peça com o zoom", () => {
    render(
      <LeaderboardPodium
        champion={{
          id: 1,
          name: "Coordenador",
          value: 500,
          position: 1,
          avatar: null,
          avatarKey: "users/1/images/avatar/x.webp",
          avatarCrop: { x: 0.5, y: 0.5, zoom: 1.8333333 },
        }}
        runnersUp={[
          {
            id: 2,
            name: "Gerente",
            value: 300,
            position: 2,
            avatar: null,
            avatarKey: "users/2/images/avatar/y.webp",
            avatarCrop: { x: 0.2, y: 0.4, zoom: 2 },
          },
        ]}
      />,
    )

    const championImg = screen.getByRole("img", { name: "Coordenador" })
    expect(championImg.closest('[data-banner-crop="true"]')).not.toBeNull()
    expect(championImg.getAttribute("style")).toContain("scale(1.8333333)")

    const runnerImg = screen.getByRole("img", { name: "Gerente" })
    expect(runnerImg.closest('[data-banner-crop="true"]')).not.toBeNull()
    expect(runnerImg.getAttribute("style")).toContain("scale(2)")
  })
})
