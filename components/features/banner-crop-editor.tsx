"use client"

import { useRef, useState } from "react"
import { BANNER_BAND_ASPECT, bannerCropBandRect, clampCropCenterToBand, type BannerCropParams } from "@/backend/domain"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * BannerCropEditor — editor de recorte estilo Facebook/LinkedIn (plan-v12, DEC-239, R7; modelo
 * da faixa arrastável escolhido pelo dono em 2026-11-04).
 *
 * A imagem inteira aparece no editor; a moldura 21:9 é uma FAIXA sobre ela. Arrastar a faixa move
 * a parte escolhida; arrastar o canto de baixo-direita redimensiona a faixa na diagonal, e o zoom
 * sai daí — não há slider. A faixa é o centro + zoom gravados nas colunas (`bannerCropX/Y/Zoom`),
 * e o render do header, do cartão e do pódio usa a MESMA conta, sem slider nenhum.
 *
 * Geometria medida no navegador: o contêiner tem a razão natural da imagem; a faixa ocupa a largura
 * plena dividida pelo zoom, e a altura segue a razão 21:9. Em jsdom não há imagem carregada nem
 * contêiner medido — a geometria é provada no navegador (demo), e os testes de jsdom provam o
 * contrato da peça (abrir, arrastar, redimensionar, salvar com clamp).
 *
 * "Resolução recomendada: 2100×900 px (21:9)" é texto da tela, dito pelo dono, não regra.
 */

interface BannerCropEditorProps {
  open: boolean
  /** URL do ORIGINAL: re-recortar abre sobre o original, não sobre o recorte. */
  src: string
  alt: string
  initial: BannerCropParams
  /** Razão da FAIXA: 21/9 para a capa, 1 para o logo quadrado. Default = faixa 21:9. */
  bandAspect?: number
  /** Título do diálogo. Default: capa. DEC-242: o editor quadrado do logo diz "logo". */
  title?: string
  /** Texto de ajuda. Default: a frase 21:9 dita pelo dono. */
  description?: string
  onCancel: () => void
  onSave: (params: BannerCropParams) => void
}

function clampToZoom(zoom: number): number {
  return Math.min(4, Math.max(1, zoom))
}

export function BannerCropEditor({
  open,
  src,
  alt,
  initial,
  bandAspect = BANNER_BAND_ASPECT,
  title = "Recorte da capa",
  description = "Arraste a faixa 21:9 para escolher a parte da capa; arraste o canto para redimensionar. Resolução recomendada: 2100×900 px (21:9).",
  onCancel,
  onSave,
}: BannerCropEditorProps) {
  const [params, setParams] = useState<BannerCropParams>(initial)
  // Razão natural da imagem (largura/altura). Sem imagem carregada (jsdom), a moldura 21:9.
  const [aspect, setAspect] = useState<number>(BANNER_BAND_ASPECT)
  const dragRef = useRef<{ x: number; y: number; mode: "move" | "resize" } | null>(null)

  function onPointerDown(event: React.PointerEvent, mode: "move" | "resize") {
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, mode }
  }

  function onPointerMove(event: React.PointerEvent, box: { clientWidth: number; clientHeight: number }) {
    const drag = dragRef.current
    if (!drag || box.clientWidth === 0 || box.clientHeight === 0) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    drag.x = event.clientX
    drag.y = event.clientY
    if (drag.mode === "move") {
      // Arrastar a faixa: o centro segue o dedo, na fração da imagem que o contêiner cobre.
      setParams((c) =>
        clampCropCenterToBand({ x: c.x + dx / box.clientWidth, y: c.y + dy / box.clientHeight, zoom: c.zoom }, bandAspect, aspect),
      )
    } else {
      // Redimensionar na diagonal: a largura da faixa cresce, o zoom é 1/largura.
      setParams((c) => {
        const w = 1 / c.zoom + dx / box.clientWidth
        return clampCropCenterToBand({ x: c.x, y: c.y, zoom: clampToZoom(1 / w) }, bandAspect, aspect)
      })
    }
  }

  function onPointerUp() {
    dragRef.current = null
  }

  const band = bannerCropBandRect(params, bandAspect, aspect)
  // A faixa não cabe em Y quando a imagem é mais alta que a moldura pede: a faixa é fixada em cima.
  const bandFitsY = band.height <= 1

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div
          data-testid="crop-preview"
          className="relative w-full overflow-hidden rounded-lg border border-border bg-muted"
          style={{ aspectRatio: `${aspect}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="absolute inset-0 h-full w-full object-cover"
            onLoad={(event) => {
              const img = event.currentTarget
              if (img.naturalWidth > 0 && img.naturalHeight > 0) setAspect(img.naturalWidth / img.naturalHeight)
            }}
          />

          {/* Faixa 21:9: a parte da imagem que vai para a moldura do header. Arrastável, com
              alça de redimensionamento no canto de baixo-direita. */}
          <div
            data-testid="crop-band"
            role="button"
            aria-label="Faixa de recorte"
            className="absolute border-2 border-ring/70 bg-background/10 outline-none"
            style={{
              left: `${band.left * 100}%`,
              top: `${(bandFitsY ? band.top : 0) * 100}%`,
              width: `${band.width * 100}%`,
              height: `${(bandFitsY ? band.height : 1) * 100}%`,
              touchAction: "none",
            }}
            onPointerDown={(event) => onPointerDown(event, "move")}
            onPointerMove={(event) => onPointerMove(event, event.currentTarget.parentElement!)}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div
              data-testid="crop-resize-handle"
              role="button"
              aria-label="Redimensionar faixa"
              className="absolute bottom-0 right-0 h-3 w-3 -translate-x-1/2 translate-y-1/2 rounded-sm bg-ring"
              style={{ touchAction: "none" }}
              onPointerDown={(event) => {
                event.stopPropagation()
                onPointerDown(event, "resize")
              }}
              onPointerMove={(event) => {
                event.stopPropagation()
                onPointerMove(event, event.currentTarget.parentElement!.parentElement!)
              }}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(clampCropCenterToBand(params, bandAspect, aspect))}>Salvar recorte</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
