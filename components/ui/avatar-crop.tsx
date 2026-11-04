"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { BannerImage } from "@/components/ui/banner-image"
import { userImageUrl } from "@/lib/api/user-images"
import type { BannerCropParams } from "@/backend/domain"

/**
 * AvatarCrop — a peça da imagem de uma pessoa (plan-v14 S02, regra 2).
 *
 * `avatarKey` existe (DEC-242): o quadrado escolhido na fábrica de recorte sai pela peça única
 * `BannerImage` com as colunas `logoCrop*` — nenhum site reinventa a conta, igual à capa do
 * projeto (DEC-239). Sem chave: o `Avatar` legado com o caminho em disco (`users.avatar`) de
 * hoje, intacto.
 *
 * A moldura (tamanho, borda, cor) fica no `className` do chamador; a peça preenche o que lhe
 * é dado, como o `BannerImage` da faixa.
 */
interface AvatarCropProps {
  userId: number
  /** Chave do avatar no bucket (`users/<id>/images/avatar/...`). Presente → peça única. */
  avatarKey?: string | null
  /** `null`/ausente = corte centrado de hoje. */
  crop?: BannerCropParams | null
  /** Caminho legado em disco (`users.avatar`), usado quando não existe `avatarKey`. */
  legacyAvatar?: string | null
  name: string
  /** Classes do círculo: tamanho e borda do chamador. */
  className?: string
  /** Iniciais do caso sem imagem nenhuma (nem chave, nem legado). */
  fallback: string
}

export function AvatarCrop({ userId, avatarKey, crop, legacyAvatar, name, className, fallback }: AvatarCropProps) {
  if (avatarKey) {
    return (
      <div className={`relative overflow-hidden rounded-full bg-muted ${className ?? ""}`}>
        <BannerImage
          src={userImageUrl(userId, "avatar", avatarKey)}
          alt={name}
          crop={crop}
          className="rounded-full"
        />
      </div>
    )
  }
  return (
    <Avatar className={className}>
      <AvatarImage src={legacyAvatar || undefined} alt={name} />
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  )
}
