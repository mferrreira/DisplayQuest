"use client"

import Image from "next/image"

/**
 * Rodapé institucional do shell do /dashboard (pedido do dono, fila V6).
 *
 * Duas marcas: o logo do Laboratório Display (asset real, public/LOGO.png) e um espaço
 * RESERVADO para a logo do IFNMG — a caixa pontilhada espera o arquivo oficial; nenhum
 * logo de terceiro é inventado.
 *
 * A imprensa (rotas /print, PDF do relatório) esconde o rodapé por CSS (`print:hidden`),
 * porque a exportação não deve carregar o chrome institucional.
 */
export function AppFooter() {
  return (
    <footer className="border-t bg-card print:hidden">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-5 md:px-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LOGO.png" alt="Laboratório Display" className="h-8 w-auto object-contain" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Laboratório Display</p>
            <p className="text-xs text-muted-foreground">Instituto Federal do Norte de Minas Gerais — Campus Salinas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-8 items-center rounded-md border border-dashed border-border px-3">
            <span className="text-xs text-muted-foreground">Logo IFNMG</span>
          </div>
          <p className="text-xs text-muted-foreground">Desenvolvido por Márcio Martins Ferreira Júnior</p>
        </div>
      </div>
    </footer>
  )
}
