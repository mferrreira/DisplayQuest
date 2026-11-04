"use client"

import * as React from "react"
import dynamic from "next/dynamic"
import { useTheme } from "next-themes"

import type { PodiumColors, PodiumEntry } from "./podium-scene"
import type { Project } from "@/contexts/types"

/**
 * plan-v13 S07 (ADR-001) — o wrapper client da cena do pódio glorioso.
 *
 * Detecta WebGL (sem ele, nada de cena: o pódio DOM de cards fica visível), lê `reduced-motion`
 * e resolve os tokens `--warning`/`--secondary` em hex na resolução do tema, porque a cena 3D
 * não lê classes Tailwind. O canvas entra via `next/dynamic` com `ssr: false`.
 */

export function detectWebGL(): boolean {
  if (typeof document === "undefined") return false
  try {
    const canvas = document.createElement("canvas")
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"))
  } catch {
    return false
  }
}

export function useWebglSupport(): boolean {
  const [supported] = React.useState(detectWebGL)
  return supported
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false)
  React.useEffect(() => {
    // o jsdom da suíte não tem matchMedia; sem ele, o caminho é "não reduzido" (AGENTS: stub
    // local ao teste é quem decide o lado de desktop)
    if (typeof window.matchMedia !== "function") return
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(mq.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])
  return reduced
}

function tokenHex(token: string, minLightness = 0): string {
  // o valor do token é uma tripla HSL. O clamp de lightness é a trava medida: em tema claro
  // o `--warning` tem L=38% e vira marrom; o ouro do campeão tem que ser ouro nos dois temas.
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  const parts = raw.split(/[\s/]+/)
  const l = Number(parts[2]?.replace("%", ""))
  const triple = Number.isFinite(l) && l < minLightness
    ? `${parts[0]} ${parts[1]} ${minLightness}%`
    : raw
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return "#888888"
  ctx.fillStyle = `hsl(${triple})`
  return String(ctx.fillStyle)
}

const PodiumCanvasLazy = dynamic(() => import("./podium-scene").then((m) => m.PodiumCanvas), { ssr: false })

export function ProjectPodium3D({
  entries,
  onSelect,
}: {
  entries: PodiumEntry[]
  onSelect?: (project: Project) => void
}) {
  const webgl = useWebglSupport()
  const reduced = useReducedMotion()
  const { resolvedTheme } = useTheme()
  const colors = React.useMemo<PodiumColors>(() => {
    if (typeof document === "undefined") return { gold: "#f6b322", neutral: "#888888" }
    return { gold: tokenHex("--warning", 55), neutral: tokenHex("--secondary", 35) }
  }, [resolvedTheme])

  if (!webgl || entries.length === 0) return null

  return (
    <div
      data-testid="podium-canvas"
      role="region"
      aria-label="Pódio dos projetos em três dimensões"
      className="h-[220px] w-full sm:h-[280px]"
    >
      <React.Suspense fallback={null}>
        <PodiumCanvasLazy entries={entries} colors={colors} reducedMotion={reduced} onSelect={onSelect} />
      </React.Suspense>
    </div>
  )
}
