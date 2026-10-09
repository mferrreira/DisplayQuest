"use client"

import { Info } from "lucide-react"

import { cn } from "@/lib/utils/utils"

interface InfoHintProps {
  /** Texto explicativo. Vai no `title`, então aparece no hover e no foco. */
  text: string
  /** Nome acessível do botão. */
  label?: string
  className?: string
}

/**
 * Botão de informação: o texto explicativo vive no `title`, então aparece no hover
 * e no foco do teclado sem abrir diálogo e sem ocupar linha.
 *
 * Medido em 2026-10-09: o painel do cronômetro flutuante (320 px de largura) gastava
 * cinco linhas com dois parágrafos explicativos, e o dono chamou de overcrowded. Os
 * parágrafos viraram este botão; o painel mostra só o que se usa.
 */
export function InfoHint({ text, label = "Mais informações", className }: InfoHintProps) {
  return (
    <button
      type="button"
      title={text}
      aria-label={label}
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  )
}
