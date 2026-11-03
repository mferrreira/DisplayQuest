"use client"

import { useEffect, useRef, useState } from "react"
import { bannerCropTransform, type BannerCropParams } from "@/backend/domain"

/**
 * BannerImage — a PEÇA ÚNICA do render de capa recortada (plan-v12, DEC-239, ADR-002).
 *
 * A peça única é a trava contra corte próprio por componente: a faixa do projeto, o perfil
 * próprio, o perfil de terceiro, o cartão da lista e o bloco do campeão consomem todos esta
 * conta, e nenhum site reinventa a matemática do recorte.
 *
 * O recorte é centro normalizado (x, y) + zoom >= 1. A cobertura cheia preenche a moldura; o
 * zoom cresce a cobertura, e o centro escolhido cai no centro da moldura. A proporção que a
 * cobertura sobressai (o `k` da conta abaixo) vem do binário medido: só depois de o `<img>`
 * carregar e o contêiner medir é que o deslocamento em % é computado. Sem número, a peça cai
 * no `object-cover` centrado de hoje — o comportamento de capa sem parâmetro.
 */

interface BannerImageProps {
  src: string
  alt: string
  /** `null`/ausente = corte centrado de hoje (`object-cover`). */
  crop?: BannerCropParams | null
  className?: string
}

export function BannerImage({ src, alt, crop, className }: BannerImageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [measure, setMeasure] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setMeasure((n) => n + 1))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const transform = (() => {
    const box = containerRef.current
    if (!crop || !natural || !box || box.clientWidth === 0) {
      const t = crop ? bannerCropTransform(crop) : { scale: 1, offsetXPct: 0, offsetYPct: 0 }
      return `translate(${t.scale * t.offsetXPct}%, ${t.scale * t.offsetYPct}%) scale(${t.scale})`
    }
    const Cw = box.clientWidth
    const Ch = box.clientHeight
    const W = natural.w
    const H = natural.h
    // `k` é quanto a cobertura cheia estoura a largura da moldura; `m` estoura a altura.
    const k = Math.max(1, (W * Ch) / (H * Cw))
    const m = Math.max(1, (H * Cw) / (Ch * W))
    const tx = (crop.x - 1 / (2 * crop.zoom * k)) * 100
    const ty = (crop.y - 1 / (2 * crop.zoom * m)) * 100
    return `translate(${tx}%, ${ty}%) scale(${crop.zoom})`
  })()

  return (
    <div
      ref={containerRef}
      data-banner-crop="true"
      data-measure={measure}
      className={`relative h-full w-full overflow-hidden ${className ?? ""}`}
    >
      <img
        src={src}
        alt={alt}
        onLoad={(event) => {
          const node = event.currentTarget
          setNatural({ w: node.naturalWidth, h: node.naturalHeight })
        }}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ transform }}
        draggable={false}
      />
    </div>
  )
}
