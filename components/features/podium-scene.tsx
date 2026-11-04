"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import {
  AdaptiveDpr, ContactShadows, Environment, Float, Html, Lightformer,
  PresentationControls, RoundedBox, Sparkles, SpotLight,
} from "@react-three/drei"
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing"
import * as THREE from "three"
import type { Mesh, Object3D } from "three"
import type { Project } from "@/contexts/types"

/**
 * plan-v13 S07 (ADR-001) — a cena do pódio glorioso de projetos: salão de campeões, não
 * três caixas. Base em camadas de pedra escura com filete dourado; o campeão domina no
 * centro sobre ouro escovado com coroa de cinco pontas e cúpula de luz quente; 2º em prata
 * fria e 3º em bronze, sobre degraus, dignos. Texturas são CanvasTexture procedurais (grão
 * fino, veios, gradiente) — nada remoto, nenhum asset. Marcas de posição, nome, pontos e a
 * distância até o próximo lugar ficam na placa da face frontal; a placa tem o link real do
 * projeto, acessível por teclado. Entrada com stagger de elevação e um único brilho
 * percorrendo o ouro; idle quase imperceptível; hover levanta e acende o contorno.
 *
 * O contrato da cena fica em `name`/`userData` dos meshes, que o test-renderer lê em node.
 * Texturas, placa, coroa, cupola, PresentationControls e postprocessing só existem onde há
 * DOM; sem DOM a cena degrada para os blocos, que é exatamente o que a suíte congela.
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

const BASE_TOP = 0.48

const SLOTS: Record<1 | 2 | 3, [number, number]> = {
  1: [0, 0],
  2: [-2.45, 0.6],
  3: [2.45, 0.6],
}

const METAL: Record<1 | 2 | 3, "gold" | "silver" | "bronze"> = { 1: "gold", 2: "silver", 3: "bronze" }

export function podiumBlockHeight(points: number, maxPoints: number): number {
  const ratio = maxPoints > 0 ? points / maxPoints : 1
  return 0.5 + 1.5 * ratio
}

function shade(hex: string, factor: number): string {
  return `#${new THREE.Color(hex).multiplyScalar(factor).getHexString()}`
}

function grainCanvas(baseA: string, baseB: string, vein: string, veins: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = c.height = 256
  const g = c.getContext("2d")!
  const grad = g.createLinearGradient(0, 0, 256, 256)
  grad.addColorStop(0, baseA)
  grad.addColorStop(1, baseB)
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  if (veins) {
    for (let i = 0; i < 22; i++) {
      g.globalAlpha = 0.06
      g.fillStyle = vein
      const y = Math.random() * 256
      g.fillRect(0, y, 256, 0.8 + Math.random())
    }
  }
  for (let i = 0; i < 1800; i++) {
    g.globalAlpha = Math.random() * 0.05
    g.fillStyle = i % 3 === 0 ? vein : "#000"
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 0.7)
  }
  return c
}

function noiseCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const g = c.getContext("2d")!
  for (let x = 0; x < 128; x++) {
    for (let y = 0; y < 128; y++) {
      const v = 140 + Math.floor(Math.random() * 110)
      g.fillStyle = `rgb(${v},${v},${v})`
      g.fillRect(x, y, 1, 1)
    }
  }
  return c
}

function buildTextures(palette: PodiumPalette) {
  const mk = (canvas: HTMLCanvasElement) => {
    const t = new THREE.CanvasTexture(canvas)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  return {
    gold: mk(grainCanvas(shade(palette.gold, 0.72), palette.gold, shade(palette.gold, 1.25), true)),
    silver: mk(grainCanvas(shade(palette.silver, 0.78), palette.silver, shade(palette.silver, 1.22), true)),
    bronze: mk(grainCanvas(shade(palette.bronze, 0.72), palette.bronze, shade(palette.bronze, 1.2), true)),
    stone: mk(grainCanvas(shade(palette.stone, 0.55), palette.stone, shade(palette.stone, 1.6), true)),
    roughness: mk(noiseCanvas()),
  }
}

function TrophyCrown({ gold }: { gold: string }) {
  return (
    <group name="trophy">
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.2, 0.24, 0.07, 32]} />
        <meshStandardMaterial color={gold} metalness={0.9} roughness={0.22} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.14, 32, 1, true]} />
        <meshStandardMaterial color={gold} metalness={0.9} roughness={0.22} side={THREE.DoubleSide} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.26, 0.14, Math.sin(a) * 0.26]}>
            <coneGeometry args={[0.05, 0.17, 12]} />
            <meshStandardMaterial color={gold} metalness={0.9} roughness={0.22} />
          </mesh>
        )
      })}
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.055, 24, 24]} />
        <meshStandardMaterial color={gold} metalness={0.6} roughness={0.15} emissive={gold} emissiveIntensity={0.25} />
      </mesh>
    </group>
  )
}

function Medal({ color }: { color: string }) {
  return (
    <group name="medal">
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.14, 0.025, 12, 40]} />
        <meshStandardMaterial color={color} metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 24]} />
        <meshStandardMaterial color={color} metalness={0.85} roughness={0.3} />
      </mesh>
    </group>
  )
}

function Plaque({
  entry,
  metal,
  z,
  y,
  onSelect,
}: {
  entry: PodiumEntry
  metal: string
  z: number
  y: number
  onSelect?: (project: Project) => void
}) {
  return (
    <Html position={[0, y, z]} center zIndexRange={[20, 0]}>
      <div
        className="w-36 rounded-md border bg-card/95 px-3 py-2 text-center shadow-xl"
        style={{ borderColor: metal }}
      >
        <p className="text-3xl font-black tabular-nums text-foreground">{entry.position}º</p>
        <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{entry.project.name}</p>
        <p className="text-xl font-bold tabular-nums text-foreground">{entry.points}</p>
        {entry.distanceText ? (
          <p className="mt-1 text-xs font-medium text-muted-foreground">{entry.distanceText}</p>
        ) : (
          <p className="mt-1 text-xs font-medium text-muted-foreground">Campeão do recorte</p>
        )}
        <button
          type="button"
          className="mt-2 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            event.stopPropagation()
            onSelect?.(entry.project)
          }}
        >
          Abrir projeto
        </button>
      </div>
    </Html>
  )
}

function PodiumPedestal({
  entry,
  height,
  palette,
  textures,
  inDom,
  anim,
  reducedMotion,
  onSelect,
}: {
  entry: PodiumEntry
  height: number
  palette: PodiumPalette
  textures: ReturnType<typeof buildTextures> | null
  inDom: boolean
  anim: { current: { t: number } }
  reducedMotion: boolean
  onSelect?: (project: Project) => void
}) {
  const [hovered, setHovered] = useState(false)
  const ref = useRef<Object3D>(null)
  const metal = METAL[entry.position]
  const metalColor = palette[metal]
  const [x, z] = SLOTS[entry.position]
  const baseY = BASE_TOP + height / 2
  const inBrowser = typeof document !== "undefined"
  useEffect(() => {
    if (inBrowser) document.body.style.cursor = hovered ? "pointer" : "auto"
    return () => {
      if (inBrowser) document.body.style.cursor = "auto"
    }
  }, [inBrowser, hovered])

  useFrame(() => {
    const t = anim.current.t
    const delay = entry.position === 1 ? 0 : entry.position === 2 ? 0.18 : 0.36
    const rise = reducedMotion ? 1 : THREE.MathUtils.clamp((t - delay) / 0.9, 0, 1)
    const ease = 1 - Math.pow(1 - rise, 3)
    if (ref.current) {
      ref.current.position.y = baseY - (1 - ease) * 1.0 + (hovered ? 0.12 : 0)
      const s = 0.72 + 0.28 * ease
      ref.current.scale.set(s, s, s)
    }
  })

  const sweep = reducedMotion
    ? 0.08
    : 0.08 + 0.45 * Math.max(0, 1 - Math.abs(anim.current.t - 1.35) / 1.4)

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
      <RoundedBox name={`pedestal-${entry.position}`} args={[1.45, height, 1.45]} radius={0.06} smoothness={4}>
        <meshStandardMaterial
          color={metalColor}
          map={textures ? textures[metal] : undefined}
          roughnessMap={textures ? textures.roughness : undefined}
          metalness={entry.position === 1 ? 0.85 : 0.72}
          roughness={0.32}
          emissive={metalColor}
          emissiveIntensity={entry.position === 1 ? sweep : hovered ? 0.2 : 0.04}
        />
      </RoundedBox>
      {/* tampona e filete dourado no topo do pedestal */}
      <RoundedBox args={[1.62, 0.06, 1.62]} radius={0.03} smoothness={4} position={[0, height / 2 + 0.03, 0]}>
        <meshStandardMaterial color={metalColor} metalness={0.9} roughness={0.2} />
      </RoundedBox>
      {/* placa de pedra na face frontal, sob a marca de posição */}
      <RoundedBox args={[1.05, 0.86, 0.05]} radius={0.03} smoothness={3} position={[0, -height * 0.12, 0.735]}>
        <meshStandardMaterial
          color={palette.stone}
          map={textures ? textures.stone : undefined}
          metalness={0.15}
          roughness={0.7}
        />
      </RoundedBox>
      {inDom && (
        <Plaque entry={entry} metal={metalColor} z={0.78} y={-height * 0.12} onSelect={onSelect} />
      )}
      {inDom && entry.position === 1 && !reducedMotion && (
        <Float speed={1.2} rotationIntensity={0.25} floatIntensity={0.35} name="crown" position={[0, height / 2 + 0.35, 0]}>
          <TrophyCrown gold={palette.gold} />
        </Float>
      )}
      {inDom && entry.position === 1 && reducedMotion && (
        <group name="crown" position={[0, height / 2 + 0.35, 0]}>
          <TrophyCrown gold={palette.gold} />
        </group>
      )}
      {inDom && entry.position !== 1 && (
        <group position={[0, height / 2 + 0.14, 0]}>
          <Medal color={metalColor} />
        </group>
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
  const textures = useMemo(() => (inDom ? buildTextures(palette) : null), [inDom, palette])
  const maxPoints = Math.max(0, ...entries.map((e) => e.points))
  const championH = entries.length > 0 ? podiumBlockHeight(entries[0].points, maxPoints) : 1

  useFrame(({ camera }, delta) => {
    anim.current.t += delta
    if (!reducedMotion) {
      camera.position.z += (5.4 - camera.position.z) * Math.min(1, delta * 1.5)
      camera.position.y += (1.6 - camera.position.y) * Math.min(1, delta * 1.5)
      camera.lookAt(0, 1.0, 0)
    }
  })

  return (
    <group name="podium-group" userData={{ animations: !reducedMotion }}>
      {/* base em camadas: laje de pedra larga, degrau e filete dourado */}
      <RoundedBox name="base-slab" args={[7.4, 0.3, 3.2]} radius={0.04} smoothness={4} position={[0, 0.15, 0]}>
        <meshStandardMaterial
          color={palette.stone}
          map={textures ? textures.stone : undefined}
          roughnessMap={textures ? textures.roughness : undefined}
          metalness={0.2}
          roughness={0.55}
        />
      </RoundedBox>
      <RoundedBox name="base-step" args={[5.6, 0.22, 2.6]} radius={0.03} smoothness={4} position={[0, 0.37, 0]}>
        <meshStandardMaterial
          color={palette.stone}
          map={textures ? textures.stone : undefined}
          metalness={0.2}
          roughness={0.5}
        />
      </RoundedBox>
      <mesh name="gold-filigree" position={[0, 0.34, 1.31]}>
        <boxGeometry args={[6.4, 0.05, 0.04]} />
        <meshStandardMaterial color={palette.gold} metalness={0.9} roughness={0.25} emissive={palette.gold} emissiveIntensity={0.12} />
      </mesh>

      {/* luz principal dramática, rim lights e ambiente baixo */}
      <ambientLight intensity={0.22} />
      <spotLight position={[2.4, 6, 4.5]} angle={0.34} penumbra={0.9} intensity={9} decay={0} castShadow />
      <spotLight position={[-4, 3.4, -3]} angle={0.4} penumbra={1} intensity={3.2} decay={0} color="#bcd3e6" />
      <spotLight position={[4.2, 2.8, -2.6]} angle={0.4} penumbra={1} intensity={2.6} decay={0} color="#e8c89a" />

      {inDom && entries.length >= 1 && !reducedMotion && (
        <Sparkles
          name="sparkles"
          count={28}
          scale={[1.8, 2.1, 1.4] as [number, number, number]}
          position={[0, championH + BASE_TOP + 1.0, 0]}
          size={2.2}
          speed={0.35}
          opacity={0.65}
          color={palette.gold}
        />
      )}

      <group name="podium-blocks">
        {entries.map((entry) => (
          <PodiumPedestal
            key={entry.project.id}
            entry={entry}
            height={podiumBlockHeight(entry.points, maxPoints)}
            palette={palette}
            textures={textures}
            inDom={inDom}
            anim={anim}
            reducedMotion={reducedMotion}
            onSelect={onSelect}
          />
        ))}
      </group>

      {inDom && entries.length >= 1 && !reducedMotion && (
        <SpotLight
          name="light-dome"
          position={[0, championH + BASE_TOP + 3.2, 1.6]}
          angle={0.22}
          penumbra={1}
          intensity={38}
          distance={10}
          attenuation={4}
          anglePower={5}
          color="#f7d27a"
        />
      )}

      {inDom && (
        <PresentationControls global speed={1.2} zoom={1.1}>
          <ContactShadows position={[0, 0.01, 0]} opacity={0.55} scale={12} blur={2.4} far={5} resolution={512} />
        </PresentationControls>
      )}

      {inDom && (
        <Environment resolution={256}>
          <Lightformer intensity={1.6} position={[0, 4, -3]} scale={[6, 3, 1]} />
          <Lightformer intensity={0.8} position={[-4, 2, 2]} scale={[3, 2, 1]} />
          <Lightformer intensity={0.8} position={[4, 2, 2]} scale={[3, 2, 1]} />
        </Environment>
      )}

      {inDom && !reducedMotion && entries.length >= 1 && (
        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={1.0} intensity={0.45} />
          <Vignette eskil={false} offset={0.2} darkness={0.62} />
        </EffectComposer>
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
      camera={{ position: [0, 2.6, 8], fov: 30 }}
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
    >
      <AdaptiveDpr pixelated />
      <PodiumScene entries={entries} palette={palette} reducedMotion={reducedMotion} onSelect={onSelect} />
    </Canvas>
  )
}
