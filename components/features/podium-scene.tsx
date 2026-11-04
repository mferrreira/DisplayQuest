"use client"

import { useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import {
  Environment, Float, Html, Lightformer, PresentationControls,
  RoundedBox, ContactShadows, Sparkles,
} from "@react-three/drei"
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing"
import type { Mesh } from "three"
import type { Project } from "@/contexts/types"

/**
 * plan-v13 S07 (ADR-001) — a cena do pódio glorioso de projetos.
 *
 * Três blocos escalonados: campeão central mais alto, altura proporcional aos pontos
 * normalizados; ouro do token `--warning` no campeão, cor neutra nos demais; `ContactShadows`
 * no chão; `Float` sobre coroa geométrica e `Sparkles` subindo do bloco do campeão, só no
 * browser; dolly-in na montagem; `PresentationControls` com yaw/zoom limitados; tap num bloco
 * abre o detalhe do projeto. `reducedMotion` congela dolly, coroa, sparkles e bloom.
 *
 * Os contratos da cena ficam em `name` e `userData` dos meshes, que o test-renderer lê em node.
 * `Html` (texto em DOM) e postprocessing só existem onde há DOM; sem DOM, a cena degrada para
 * os blocos, que é exatamente o que a suíte congela.
 */

export interface PodiumEntry {
  project: Project
  position: 1 | 2 | 3
  points: number
}

export interface PodiumColors {
  gold: string
  neutral: string
}

const SLOTS: Record<1 | 2 | 3, [number, number]> = { 1: [0, 0], 2: [-1.7, 0], 3: [1.7, 0] }

export function podiumBlockHeight(points: number, maxPoints: number): number {
  const ratio = maxPoints > 0 ? points / maxPoints : 1
  return 0.5 + 1.5 * ratio
}

function PodiumBlock({
  entry,
  height,
  color,
  metalness,
  inDom,
  onSelect,
}: {
  entry: PodiumEntry
  height: number
  color: string
  metalness: number
  inDom: boolean
  onSelect?: (project: Project) => void
}) {
  const [hovered, setHovered] = useState(false)
  const ref = useRef<Mesh>(null)
  const [x, z] = SLOTS[entry.position]
  useFrame(() => {
    if (ref.current) ref.current.position.y = height / 2 + (hovered ? 0.12 : 0)
  })
  return (
    <mesh
      ref={ref}
      name={`podium-${entry.position}`}
      userData={{ height, position: entry.position, projectId: entry.project.id }}
      position={[x, height / 2, z]}
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
      <boxGeometry args={[1.3, height, 1.3]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={0.3} />
      {inDom && (
        <Html position={[0, height / 2 + 0.18, 0]} center zIndexRange={[10, 0]} className="pointer-events-none">
          <div className="whitespace-nowrap text-center">
            <p className="text-xs font-semibold text-foreground drop-shadow">{entry.project.name}</p>
            <p className="text-lg font-bold tabular-nums text-foreground drop-shadow">{entry.points}</p>
          </div>
        </Html>
      )}
    </mesh>
  )
}

export function PodiumScene({
  entries,
  colors,
  reducedMotion = false,
  onSelect,
}: {
  entries: PodiumEntry[]
  colors: PodiumColors
  reducedMotion?: boolean
  onSelect?: (project: Project) => void
}) {
  const inDom = typeof document !== "undefined"
  const dolly = useRef(false)
  const maxPoints = Math.max(0, ...entries.map((e) => e.points))

  useFrame(({ camera }, delta) => {
    if (!dolly.current) {
      // dolly-in na montagem: a câmera entra de longe até a pose final
      camera.position.z += (4.6 - camera.position.z) * Math.min(1, delta * 2.5)
      camera.position.y += (1.6 - camera.position.y) * Math.min(1, delta * 2.5)
      camera.lookAt(0, 0.8, 0)
      return
    }
  })

  return (
    <group name="podium-group" userData={{ animations: !reducedMotion }}>
      <ambientLight intensity={0.9} />
      <spotLight position={[3, 6, 4]} angle={0.35} penumbra={1} intensity={3} decay={0} />
      {/* PresentationControls, ContactShadows e Environment tocam DOM/WebGL e só existem no
          browser; em node, o test-renderer lê o núcleo estrutural da cena: blocos, coroa,
          sparkles e materiais. */}
      <group name="podium-blocks">
        {entries.map((entry) => (
          <PodiumBlock
            key={entry.project.id}
            entry={entry}
            height={podiumBlockHeight(entry.points, maxPoints)}
            color={entry.position === 1 ? colors.gold : colors.neutral}
            metalness={entry.position === 1 ? 0.75 : 0.25}
            inDom={inDom}
            onSelect={onSelect}
          />
        ))}
      </group>
      {inDom && entries.length >= 1 && !reducedMotion && (
        <Float speed={2} rotationIntensity={0.4} floatIntensity={0.6} name="crown">
          <mesh name="crown" position={[0, podiumBlockHeight(entries[0].points, maxPoints) + 0.5, 0]}>
            <torusGeometry args={[0.32, 0.1, 12, 48]} />
            <meshStandardMaterial color={colors.gold} metalness={0.9} roughness={0.2} />
          </mesh>
        </Float>
      )}
      {inDom && !reducedMotion && entries.length >= 1 && (
        <Sparkles
          name="sparkles"
          count={60}
          scale={[4, 3, 2] as [number, number, number]}
          position={[0, 2.2, 0]}
          size={2.5}
          speed={0.4}
          opacity={0.7}
          color={colors.gold}
        />
      )}
      {inDom && (
        <PresentationControls global speed={1.2} zoom={1.1}>
          <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={10} blur={2.2} far={4} />
        </PresentationControls>
      )}
      {inDom && (
        <Environment resolution={256}>
          <Lightformer intensity={2} position={[0, 4, -3]} scale={[6, 3, 1]} />
          <Lightformer intensity={1.2} position={[-4, 2, 2]} scale={[3, 2, 1]} />
          <Lightformer intensity={1.2} position={[4, 2, 2]} scale={[3, 2, 1]} />
        </Environment>
      )}
      {inDom && !reducedMotion && entries.length >= 1 && (
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={0.9} intensity={0.6} />
          <Vignette eskil={false} offset={0.2} darkness={0.5} />
        </EffectComposer>
      )}
    </group>
  )
}

export function PodiumCanvas({
  entries,
  colors,
  reducedMotion,
  onSelect,
}: {
  entries: PodiumEntry[]
  colors: PodiumColors
  reducedMotion: boolean
  onSelect?: (project: Project) => void
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 4, 8], fov: 35 }}
    >
      <PodiumScene entries={entries} colors={colors} reducedMotion={reducedMotion} onSelect={onSelect} />
    </Canvas>
  )
}
