"use client"

import { useRef, useState } from "react"
import { bannerCropCenterBounds, clampBannerCrop, type BannerCropParams } from "@/backend/domain"
import { BannerImage } from "@/components/ui/banner-image"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

/**
 * BannerCropEditor — editor de recorte estilo Facebook/LinkedIn (plan-v12, DEC-239, R7).
 *
 * O original entra inteiro (URL do binário), a moldura é fixa 21:9, e o usuário arrasta e dá zoom
 * para escolher a parte visível. Salvar devolve os parâmetros CLAMPADOS por `clampBannerCrop` — a
 * mesma conta da rota, uma cópia só. "Resolução recomendada: 2100×900 px (21:9)" é texto da tela,
 * dito pelo dono, não regra.
 *
 * Arrastar: o centro anda `-dx/(Cw·zoom)` por eixo — o deslocamento em pixels convertido na fração
 * da imagem que a janela mostra. Sem contêiner medido (jsdom), o arrasto não move: os testes de
 * jsdom provam o contrato da peça, e a geometria é provada no navegador (demo).
 */

interface BannerCropEditorProps {
  open: boolean
  /** URL do ORIGINAL: re-recortar abre sobre o original, não sobre o recorte. */
  src: string
  alt: string
  initial: BannerCropParams
  onCancel: () => void
  onSave: (params: BannerCropParams) => void
}

export function BannerCropEditor({ open, src, alt, initial, onCancel, onSave }: BannerCropEditorProps) {
  const [params, setParams] = useState<BannerCropParams>(initial)
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  function moveBy(dx: number, dy: number, box: { clientWidth: number; clientHeight: number }) {
    if (box.clientWidth === 0 || box.clientHeight === 0) return
    setParams((current) =>
      clampBannerCrop({
        x: current.x - dx / (box.clientWidth * current.zoom),
        y: current.y - dy / (box.clientHeight * current.zoom),
        zoom: current.zoom,
      }),
    )
  }

  function setZoom(zoom: number) {
    // Zoom novo estreita a janela; o centro entra na janela que o zoom permite.
    setParams((current) => clampBannerCrop({ ...current, zoom }))
  }

  const bounds = bannerCropCenterBounds(params.zoom)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Recorte da capa</DialogTitle>
          <DialogDescription>
            Arraste e dê zoom para escolher a parte visível da moldura 21:9. Resolução recomendada: 2100×900 px (21:9).
          </DialogDescription>
        </DialogHeader>

        <div
          data-testid="crop-preview"
          className="aspect-[21/9] w-full touch-none overflow-hidden rounded-lg border border-border bg-muted"
          onPointerDown={(event) => {
            dragRef.current = { x: event.clientX, y: event.clientY }
          }}
          onPointerMove={(event) => {
            if (!dragRef.current) return
            const box = event.currentTarget
            moveBy(event.clientX - dragRef.current.x, event.clientY - dragRef.current.y, box)
            dragRef.current = { x: event.clientX, y: event.clientY }
          }}
          onPointerUp={() => {
            dragRef.current = null
          }}
          onPointerLeave={() => {
            dragRef.current = null
          }}
        >
          <BannerImage src={src} alt={alt} crop={params} />
        </div>

        <label className="grid gap-1">
          <span className="text-sm text-muted-foreground">Zoom: {params.zoom.toFixed(1)}</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.1}
            value={params.zoom}
            aria-label="Zoom da capa"
            onChange={(event) => setZoom(Number(event.target.value))}
            className="w-full"
          />
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(clampBannerCrop(params))}>Salvar recorte</Button>
        </DialogFooter>

        <p className="text-xs text-muted-foreground">
          Centro permitido neste zoom: {bounds.lo.toFixed(3)} a {bounds.hi.toFixed(3)} por eixo.
        </p>
      </DialogContent>
    </Dialog>
  )
}
