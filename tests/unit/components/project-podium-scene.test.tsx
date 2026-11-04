// @vitest-environment node
/**
 * plan-v13 S07 (ADR-001) — a cena do pódio glorioso de projetos.
 *
 * Roda em `node` com `@react-three/test-renderer`: sem WebGL, sem DOM. Congela o contrato da
 * cena: os blocos por posição, o campeão central e mais alto, o ouro do token no campeão, a
 * cor neutra nos demais, `Html` por bloco, e o `reduced-motion` que derruba as animações.
 */
import { create as createTestScene } from "@react-three/test-renderer"
import { describe, expect, it } from "vitest"
import type { Project } from "@/contexts/types"

import { PodiumScene, podiumBlockHeight, type PodiumEntry } from "@/components/features/podium-scene"

const COLORS = { gold: "#f6b322", neutral: "#4a4a52" }

function project(id: number, name: string, points: number): Project {
  return {
    id, name, subtitle: null, description: null, createdAt: "2026-01-01",
    createdBy: 1, status: "active", points, logoKey: null, bannerKey: null,
  }
}

const P1 = { project: project(1, "Pesquisa em IA", 30), position: 1 as const, points: 30 }
const P2 = { project: project(2, "Automação", 20), position: 2 as const, points: 20 }
const P3 = { project: project(3, "Microscopia", 10), position: 3 as const, points: 10 }

async function renderScene(entries: PodiumEntry[], reducedMotion = false) {
  // o create do test-renderer v9 é assíncrono; `scene.instance` é a root THREE da cena
  const renderer = await createTestScene(
    <PodiumScene entries={entries} colors={COLORS} reducedMotion={reducedMotion} />
  )
  return renderer.scene.instance
}

describe("PodiumScene", () => {
  it("os três blocos existem, o campeão é central e o mais alto, na ordem dos pontos", async () => {
    const scene = await renderScene([P1, P2, P3])
    const b1 = scene.getObjectByName("podium-1")
    const b2 = scene.getObjectByName("podium-2")
    const b3 = scene.getObjectByName("podium-3")
    expect(b1).toBeDefined()
    expect(b2).toBeDefined()
    expect(b3).toBeDefined()
    expect(b1!.position.x).toBe(0)
    expect(b1!.userData.height).toBeGreaterThan(b2!.userData.height)
    expect(b2!.userData.height).toBeGreaterThan(b3!.userData.height)
    expect(b2!.position.x).toBeLessThan(0)
    expect(b3!.position.x).toBeGreaterThan(0)
  })

  it("o campeão leva o ouro do token; 2º e 3º a cor neutra", async () => {
    const scene = await renderScene([P1, P2, P3])
    const champion = scene.getObjectByName("podium-1") as any
    const runner = scene.getObjectByName("podium-2") as any
    expect(champion.material.color.getHexString()).toBe(COLORS.gold.replace("#", ""))
    expect(runner.material.color.getHexString()).toBe(COLORS.neutral.replace("#", ""))
  })

  it("reduced-motion congela as animações: o flag da cena desliga coroa, sparkles e bloom", async () => {
    const animated = await renderScene([P1, P2, P3], false)
    const staticScene = await renderScene([P1, P2, P3], true)
    // em node não há DOM, então os componentes de DOM (Float, Sparkles, Bloom) ficam de fora;
    // o contrato medido aqui é o flag que a cena escreve no grupo, e os blocos ficam de pé.
    expect(animated.getObjectByName("podium-group")!.userData.animations).toBe(true)
    expect(staticScene.getObjectByName("podium-group")!.userData.animations).toBe(false)
    expect(staticScene.getObjectByName("podium-1")).toBeDefined()
  })

  it("1 projeto = só o bloco do campeão; 2 = campeão + 2º, sem terceiro", async () => {
    const solo = await renderScene([P1])
    expect(solo.getObjectByName("podium-1")).toBeDefined()
    expect(solo.getObjectByName("podium-2")).toBeUndefined()

    const duo = await renderScene([P1, P2])
    expect(duo.getObjectByName("podium-2")).toBeDefined()
    expect(duo.getObjectByName("podium-3")).toBeUndefined()
  })

  it("a altura do bloco é proporcional aos pontos normalizados", async () => {
    expect(podiumBlockHeight(30, 30)).toBeCloseTo(2, 5)
    expect(podiumBlockHeight(15, 30)).toBeCloseTo(1.25, 5)
    expect(podiumBlockHeight(0, 30)).toBeCloseTo(0.5, 5)
    // todos zero: nenhum bloco raso, o campeão mantém a altura cheia
    expect(podiumBlockHeight(0, 0)).toBeCloseTo(2, 5)
  })
})
