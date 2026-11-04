"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { AdaptiveDpr, ContactShadows, Float, Sparkles } from "@react-three/drei"
import * as THREE from "three"
import type { Object3D } from "three"
import type { Project } from "@/contexts/types"

/**
 * plan-v13 S07 (ADR-001) — primeira composição lúdica do pódio de projetos.
 *
 * O dono recusou a direção realista (monumento/pedra/metal/salão): "o sistema inteiro não é
 * realista; eu queria algo mais divertido, lúdico, não um pódio propriamente dito". Esta cena
 * é um mundo de jogo: plataformas octogonais flutuantes em silhuetas distintas numa trilha
 * ascendente, o campeão com portal dourado, estrela, halo e estrelas orbitando; confete curto
 * na entrada; pop com overshoot. Nome, posição, pontos e a distância até o próximo lugar são
 * inscritos numa placa na face da plataforma (CanvasTexture), não cartão DOM sobre o canvas.
 * Cores dos tokens da interface, materiais limpos e suaves, sem metal físico, sem palco
 * escuro. Clique no alvo grande da plataforma; lista DOM visível e keyboard-accessible fica
 * no leaderboard. reduced-motion congela tudo.
 */

export interface PodiumEntry {
  project: Project
  position: 1 | 2 | 3
  points: number
  distanceText: string | null
}

export interface PodiumPalette {
  gold: string
  silver: string
  bronze: string
  stone: string
}

const SLOTS: Record<1 | 2 | 3, [number, number]> = {
  1: [1.7, -0.5],
  2: [-0.9, 0.3],
  3: [-2.6, 1.0],
}

const DISC_R: Record<1 | 2 | 3, number> = { 1: 1.35, 2: 1.05, 3: 0.85 }

const METAL: Record<1 | 2 | 3, "gold" | "silver" | "bronze"> = { 1: "gold", 2: "silver", 3: "bronze" }

export function podiumBlockHeight(points: number, maxPoints: number): number {
  const ratio = maxPoints > 0 ? points / maxPoints : 1
  return 0.5 + 1.5 * ratio
}

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeStarGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  const outer = 0.22
  const inner = 0.09
  const spikes = 5
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  })
  g.center()
  return g
}

function plaqueTexture(entry: PodiumEntry, palette: PodiumPalette): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = 512
  c.height = 420
  const g = c.getContext("2d")!
  g.clearRect(0, 0, 512, 420)
  // placa toy: retângulo arredondado na cor da pedra clareada, borda do metal, cantos limpos
  const face = new THREE.Color(palette.stone).multiplyScalar(1.35)
  g.fillStyle = `#${face.getHexString()}`
  g.beginPath()
  g.roundRect(14, 14, 484, 392, 28)
  g.fill()
  g.lineWidth = 10
  g.strokeStyle = palette[METAL[entry.position]]
  g.stroke()
  const ink = face.r + face.g + face.b > 1.5 ? "rgba(18,20,26,0.94)" : "rgba(238,241,245,0.94)"
  g.fillStyle = ink
  g.textAlign = "center"
  g.font = "bold 170px sans-serif"
  g.fillText(`${entry.position}º`, 256, 196)
  g.font = "bold 48px sans-serif"
  g.fillText(entry.project.name, 256, 262)
  g.font = "bold 74px sans-serif"
  g.fillText(String(entry.points), 256, 342)
  g.font = "600 34px sans-serif"
  g.fillText(entry.distanceText ? entry.distanceText : "Campeão", 256, 388)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function ConfettiBurst({ anim, reducedMotion, palette }: { anim: { current: { t: number } }; reducedMotion: boolean; palette: PodiumPalette }) {
  const ref = useRef<THREE.Group>(null)
  const items = useMemo(() => {
    const rng = mulberry32(0x2f)
    const colors = [palette.gold, palette.silver, palette.bronze, "#8b5cf6", palette.stone]
    return Array.from({ length: 24 }, () => ({
      x: rng() * 6 - 3,
      y: 2.2 + rng() * 1.6,
      z: rng() * 2 - 1,
      vy: 1.4 + rng() * 1.6,
      rot: rng() * 6.28,
      w: 0.06 + rng() * 0.08,
      h: 0.05 + rng() * 0.06,
      color: colors[Math.floor(rng() * colors.length)],
    }))
  }, [palette])

  useFrame(() => {
    const t = anim.current.t
    if (!ref.current) return
    ref.current.visible = t < 2.2
    if (ref.current.visible) {
      ref.current.children.forEach((child, i) => {
        const it = items[i]
        child.position.y = it.y - t * it.vy
        child.rotation.z = it.rot + t * 3
      })
    }
  })

  return (
    <group name="confetti" ref={ref}>
      {items.map((it, i) => (
        <mesh key={i} position={[it.x, it.y, it.z]}>
          <planeGeometry args={[it.w, it.h]} />
          <meshBasicMaterial color={it.color} transparent opacity={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

function ToyPlatform({
  entry,
  height,
  palette,
  inDom,
  anim,
  reducedMotion,
  onSelect,
}: {
  entry: PodiumEntry
  height: number
  palette: PodiumPalette
  inDom: boolean
  anim: { current: { t: number } }
  reducedMotion: boolean
  onSelect?: (project: Project) => void
}) {
  const [hovered, setHovered] = useState(false)
  const ref = useRef<Object3D>(null)
  const [x, z] = SLOTS[entry.position]
  const r = DISC_R[entry.position]
  const discH = 0.3 + height * 0.22
  const baseY = 0.5 + height * 0.55
  const color = palette[METAL[entry.position]]
  const inBrowser = typeof document !== "undefined"
  const plaque = useMemo(() => (inDom ? plaqueTexture(entry, palette) : null), [entry, palette, inDom])
  const star = useMemo(() => (inDom ? makeStarGeometry() : null), [inDom])
  useEffect(() => {
    return () => {
      plaque?.dispose()
      star?.dispose()
    }
  }, [plaque, star])
  useEffect(() => {
    if (inBrowser) document.body.style.cursor = hovered ? "pointer" : "auto"
    return () => {
      if (inBrowser) document.body.style.cursor = "auto"
    }
  }, [inBrowser, hovered])

  useFrame(() => {
    const t = anim.current.t
    const delay = entry.position === 1 ? 0.25 : entry.position === 2 ? 0.12 : 0
    const rise = reducedMotion ? 1 : THREE.MathUtils.clamp((t - delay) / 0.7, 0, 1)
    const pop = 1 - Math.pow(1 - rise, 3)
    const bounce = rise > 0 && rise < 1 ? Math.sin(rise * Math.PI) * 0.12 : 0
    if (ref.current) {
      ref.current.position.y = baseY - (1 - pop) * 1.6 + bounce + (hovered ? 0.08 : 0)
      const s = 0.6 + 0.4 * pop
      ref.current.scale.set(s, s, s)
    }
  })

  const championExtras = inDom && entry.position === 1
  const starGroup = (
    <mesh name="star" geometry={star ?? undefined} position={[0, 1.05, 0]} scale={1.6}>
      <meshStandardMaterial color={color} metalness={0.1} roughness={0.35} emissive={color} emissiveIntensity={hovered ? 0.35 : 0.2} />
    </mesh>
  )

  return (
    <group
      ref={ref}
      name={`podium-${entry.position}`}
      userData={{ height, position: entry.position, projectId: entry.project.id }}
      position={[x, baseY, z]}
      onClick={(event) => {
        event.stopPropagation()
        onSelect?.(entry.project)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      {/* plataforma octogonal: silhueta de jogo, material limpo sem metal físico */}
      <mesh name={`disc-${entry.position}`}>
        <cylinderGeometry args={[r, r, discH, 8]} />
        <meshStandardMaterial
          color={color}
          metalness={0.05}
          roughness={0.45}
          emissive={color}
          emissiveIntensity={hovered ? 0.15 : 0.04}
        />
      </mesh>
      {/* aro de destaque no topo da plataforma */}
      <mesh position={[0, discH / 2 + 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r - 0.08, 0.045, 12, 40]} />
        <meshStandardMaterial color={color} metalness={0.2} roughness={0.3} emissive={color} emissiveIntensity={0.12} />
      </mesh>
      {/* placa toy na face frontal, inscrita na plataforma */}
      <mesh name={`plaque-${entry.position}`} position={[0, -0.18, r * 0.72]} rotation={[-0.28, 0, 0]}>
        <planeGeometry args={[1.12, 0.9]} />
        <meshStandardMaterial
          map={plaque ?? undefined}
          color={plaque ? "#ffffff" : palette.stone}
          metalness={0.05}
          roughness={0.5}
          transparent
        />
      </mesh>

      {championExtras && (
        <group name="champion-props">
          {/* halo macio e portal dourado: o emblema de conquista do 1º lugar */}
          <mesh name="halo" position={[0, 1.15, -1.1]}>
            <circleGeometry args={[1.9, 48]} />
            <meshBasicMaterial color={palette.gold} transparent opacity={0.22} />
          </mesh>
          <mesh name="portal" position={[0, 1.05, -0.35]}>
            <torusGeometry args={[0.85, 0.08, 16, 48]} />
            <meshStandardMaterial color={palette.gold} metalness={0.25} roughness={0.3} emissive={palette.gold} emissiveIntensity={0.35} />
          </mesh>
          {reducedMotion ? starGroup : (
            <Float speed={1.4} rotationIntensity={0.2} floatIntensity={0.4} name="crown-star">
              {starGroup}
            </Float>
          )}
          {!reducedMotion && (
            <group name="orbit">
              {[0, 1, 2].map((i) => {
                const a = (i / 3) * Math.PI * 2
                return (
                  <mesh key={i} geometry={star ?? undefined} position={[Math.cos(a) * 1.7, 1.05, Math.sin(a) * 1.7]} scale={0.7}>
                    <meshStandardMaterial color={palette.gold} metalness={0.1} roughness={0.35} emissive={palette.gold} emissiveIntensity={0.3} />
                  </mesh>
                )
              })}
            </group>
          )}
        </group>
      )}

      {inDom && entry.position !== 1 && (
        <mesh geometry={star ?? undefined} position={[0, 0.6, 0]} scale={0.9}>
          <meshStandardMaterial color={color} metalness={0.1} roughness={0.35} emissive={color} emissiveIntensity={0.18} />
        </mesh>
      )}
    </group>
  )
}

export function PodiumScene({
  entries,
  palette,
  reducedMotion = false,
  onSelect,
}: {
  entries: PodiumEntry[]
  palette: PodiumPalette
  reducedMotion?: boolean
  onSelect?: (project: Project) => void
}) {
  const inDom = typeof document !== "undefined"
  const anim = useRef({ t: reducedMotion ? 99 : 0 })
  const maxPoints = Math.max(0, ...entries.map((e) => e.points))
  const championH = entries.length > 0 ? podiumBlockHeight(entries[0].points, maxPoints) : 1

  useFrame(({ camera }, delta) => {
    anim.current.t += delta
    if (!reducedMotion) {
      camera.position.z += (6.8 - camera.position.z) * Math.min(1, delta * 1.5)
      camera.position.y += (1.5 - camera.position.y) * Math.min(1, delta * 1.5)
      camera.lookAt(0.5, 1.1, 0)
    }
  })

  const trailPads: Array<[number, number, number, number]> = [
    [-3.5, 0.35, 1.5, 0.45],
    [-1.9, 0.6, 0.7, 0.38],
    [0.4, 0.85, -0.1, 0.32],
  ]

  return (
    <group name="podium-group" userData={{ animations: !reducedMotion }}>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#bcd3e6" />

      {/* trilha ascendente: padas flutuantes de pedra clara da cor do tema */}
      {trailPads.map(([px, py, pz, pr], i) => (
        <mesh key={i} name={`trail-pad-${i + 1}`} position={[px, py, pz]}>
          <cylinderGeometry args={[pr, pr, 0.14, 6]} />
          <meshStandardMaterial color={palette.stone} metalness={0.05} roughness={0.6} transparent opacity={0.85} />
        </mesh>
      ))}

      {inDom && entries.length >= 1 && !reducedMotion && (
        <Sparkles
          name="sparkles"
          count={16}
          scale={[2.2, 2.2, 1.6] as [number, number, number]}
          position={[1.7, championH + 1.2, -0.5]}
          size={1.6}
          speed={0.35}
          opacity={0.5}
          color={palette.gold}
        />
      )}

      {inDom && entries.length >= 1 && !reducedMotion && (
        <ConfettiBurst anim={anim} reducedMotion={reducedMotion} palette={palette} />
      )}

      <group name="podium-blocks">
        {entries.map((entry) => (
          <ToyPlatform
            key={entry.project.id}
            entry={entry}
            height={podiumBlockHeight(entry.points, maxPoints)}
            palette={palette}
            inDom={inDom}
            anim={anim}
            reducedMotion={reducedMotion}
            onSelect={onSelect}
          />
        ))}
      </group>

      {inDom && (
        <ContactShadows position={[0, 0.02, 0]} opacity={0.35} scale={12} blur={2.6} far={4} resolution={512} />
      )}
    </group>
  )
}

export function PodiumCanvas({
  entries,
  palette,
  reducedMotion,
  onSelect,
}: {
  entries: PodiumEntry[]
  palette: PodiumPalette
  reducedMotion: boolean
  onSelect?: (project: Project) => void
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 2.5, 8.6], fov: 40 }}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
    >
      <AdaptiveDpr pixelated />
      <PodiumScene entries={entries} palette={palette} reducedMotion={reducedMotion} onSelect={onSelect} />
    </Canvas>
  )
}
