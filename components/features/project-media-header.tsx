"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ImageOff, Loader2, Trash2, Upload } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import {
  deleteProjectImage,
  projectImageUrl,
  updateProjectBannerCrop,
  updateProjectLogoCrop,
  uploadProjectImage,
  type ProjectImageSlot,
  type ProjectImageState,
} from "@/lib/api/project-files"
import { BannerCropEditor } from "@/components/features/banner-crop-editor"
import { BannerImage } from "@/components/ui/banner-image"
import { bannerCropFromColumns, SQUARE_BAND_ASPECT, type BannerCropParams } from "@/backend/domain"

/**
 * V5-2d (DEC-102) — capa e logo do projeto, no topo do detalhe.
 *
 * O binário mora no bucket e chega por `/api/projects/<id>/images/<slot>/file`, rota que aplica a
 * regra de acesso do projeto (a sessão vai pelo cookie, então a URL serve num `<img>`).
 *
 * O estado das duas chaves é local e nasce do `project` que a tela recebeu. Local de propósito:
 * a lista de projetos não mostra imagem, e fazer a subida atravessar três níveis de estado para
 * atualizar uma tela que não mostra a imagem seria estado a mais sem uso.
 *
 * plan-v12 (DEC-241, R7): escolhido o arquivo da capa, o editor 21:9 abre sobre o ORIGINAL
 * (mesmo editor da peça do perfil, DEC-241) e o salvar sobe o arquivo + grava o recorte pela rota
 * de parâmetros. "Recortar capa" reabre o editor sobre o binário do bucket, nunca sobre o recorte.
 *
 * DEC-242: o logo também passa pelo editor, com a FAIXA QUADRADA (`bandAspect = 1`), e o salvar
 * grava `logoCrop*`. O render do logo continua cover simples — a tela não aplica o corte, e as
 * colunas guardam a área escolhida. SUPERADO em plan-v14 S01 (regra 1): a tela passa a aplicar o
 * corte pela peça única, nas três superfícies.
 */
interface ProjectMediaHeaderProps {
  projectId: number
  projectName: string
  logoKey?: string | null
  bannerKey?: string | null
  bannerCrop?: BannerCropParams | null
  /** DEC-242: recorte quadrado do logo, a mesma tupla da capa. */
  logoCrop?: BannerCropParams | null
  canManage: boolean
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"
const DEFAULT_CROP: BannerCropParams = { x: 0.5, y: 0.5, zoom: 1 }
const LOGO_SQUARE_DESCRIPTION =
  "Arraste a faixa quadrada para escolher a parte do logo; arraste o canto para redimensionar. Logo quadrado: resolução recomendada 1000×1000 px (1:1)."

export function ProjectMediaHeader({
  projectId,
  projectName,
  logoKey,
  bannerKey,
  bannerCrop,
  logoCrop,
  canManage,
}: ProjectMediaHeaderProps) {
  const { toast } = useToast()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [currentLogoKey, setCurrentLogoKey] = useState(logoKey ?? null)
  const [currentBannerKey, setCurrentBannerKey] = useState(bannerKey ?? null)
  const [currentCrop, setCurrentCrop] = useState<BannerCropParams | null>(bannerCrop ?? null)
  const [currentLogoCrop, setCurrentLogoCrop] = useState<BannerCropParams | null>(logoCrop ?? null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null)
  const [editorSession, setEditorSession] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [logoEditorSession, setLogoEditorSession] = useState(0)
  const [logoEditorOpen, setLogoEditorOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // O diálogo é o mesmo componente ao abrir outro projeto: sem isto, a tela mostraria a imagem do
  // projeto anterior até a próxima subida.
  useEffect(() => {
    setCurrentLogoKey(logoKey ?? null)
    setCurrentBannerKey(bannerKey ?? null)
    setCurrentCrop(bannerCrop ?? null)
    setCurrentLogoCrop(logoCrop ?? null)
  }, [projectId, logoKey, bannerKey, bannerCrop, logoCrop])

  /** Toda resposta das rotas de imagem vem com as tuplas completas: o estado segue a resposta. */
  const applyState = useCallback((state: ProjectImageState) => {
    setCurrentLogoKey(state.logoKey)
    setCurrentBannerKey(state.bannerKey)
    setCurrentCrop(bannerCropFromColumns(state.bannerCropX, state.bannerCropY, state.bannerCropZoom))
    setCurrentLogoCrop(bannerCropFromColumns(state.logoCropX, state.logoCropY, state.logoCropZoom))
  }, [])

  function openEditor() {
    setEditorSession((n) => n + 1)
    setEditorOpen(true)
  }

  function openLogoEditor() {
    setLogoEditorSession((n) => n + 1)
    setLogoEditorOpen(true)
  }

  async function handleUpload(slot: ProjectImageSlot) {
    const input = slot === "logo" ? logoInputRef.current : bannerInputRef.current
    const file = input?.files?.[0]
    if (!file) {
      toast({
        title: "Nada para enviar",
        description: slot === "logo" ? "Escolha a imagem do logo primeiro." : "Escolha a imagem da capa primeiro.",
      })
      return
    }

    // A capa passa pelo editor 21:9 antes de escrever (DEC-241); o logo passa pelo editor
    // quadrado (DEC-242). Os dois sobem o arquivo só depois de o recorte ser escolhido.
    if (slot === "banner") {
      setPendingFile(file)
      openEditor()
      return
    }

    setPendingLogoFile(file)
    openLogoEditor()
  }

  async function handleSaveCrop(params: BannerCropParams) {
    const uploading = pendingFile !== null
    const fileName = pendingFile?.name
    setBusy(true)
    try {
      if (pendingFile) {
        await uploadProjectImage(projectId, "banner", pendingFile)
        setPendingFile(null)
        if (bannerInputRef.current) bannerInputRef.current.value = ""
      }
      const saved = await updateProjectBannerCrop(projectId, params)
      applyState(saved)
      toast({
        title: uploading ? "Capa atualizada" : "Recorte salvo",
        description: uploading ? fileName ?? "Resolução recomendada: 2100×900 px (21:9)" : "A moldura 21:9 mostra a parte escolhida.",
      })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao gravar a capa",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
      setEditorOpen(false)
    }
  }

  /** DEC-242 — salvar o quadrado do logo: sobe o arquivo (se escolhido) e grava `logoCrop*`. */
  async function handleSaveLogoCrop(params: BannerCropParams) {
    const uploading = pendingLogoFile !== null
    const fileName = pendingLogoFile?.name
    setBusy(true)
    try {
      if (pendingLogoFile) {
        await uploadProjectImage(projectId, "logo", pendingLogoFile)
        setPendingLogoFile(null)
        if (logoInputRef.current) logoInputRef.current.value = ""
      }
      const saved = await updateProjectLogoCrop(projectId, params)
      applyState(saved)
      toast({
        title: uploading ? "Logo atualizado" : "Recorte do logo salvo",
        description: uploading ? fileName ?? "Resolução recomendada: 1000×1000 px (1:1)" : "A faixa quadrada escolhe a parte do logo.",
      })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao gravar o logo",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
      setLogoEditorOpen(false)
    }
  }

  async function handleRemove(slot: ProjectImageSlot) {
    if (!confirm(slot === "logo" ? "Remover o logo do projeto?" : "Remover a capa do projeto?")) return

    setBusy(true)
    try {
      const state = await deleteProjectImage(projectId, slot)
      applyState(state)
      toast({ title: slot === "logo" ? "Logo removido" : "Capa removida" })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao remover imagem",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const editorSrc = pendingFile
    ? (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(pendingFile) : "")
    : projectImageUrl(projectId, "banner", currentBannerKey)

  const logoEditorSrc = pendingLogoFile
    ? (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(pendingLogoFile) : "")
    : projectImageUrl(projectId, "logo", currentLogoKey)

  return (
    <div className="space-y-3">
      <div className="relative pb-8">
        {/* Dono (2026-11, DEC-240): a faixa de capa do projeto é 21:9 (`aspect-[21/9]`),
            largura plena, sem altura fixa; o cartão da lista de projetos mantém h-16 sm:h-24.
            O logo sobreposto fica no canto de baixo-esquerda da faixa. */}
        <div className="aspect-[21/9] overflow-hidden rounded-lg border bg-muted">
          {currentBannerKey ? (
            <BannerImage
              src={projectImageUrl(projectId, "banner", currentBannerKey)}
              alt={`Capa do projeto ${projectName}`}
              crop={currentCrop}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <ImageOff className="h-5 w-5" />
              Sem capa
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-4">
          {currentLogoKey ? (
            // plan-v14 S01 (regra 1): o corte quadrado gravado pelo editor DEC-242 passa a ser
            // aplicado — a peça única renderiza o logo, o círculo da moldura mostra a área
            // escolhida, e o comentário da DEC-242 ("a tela não aplica o corte") fica superado.
            <div className="h-16 w-16 rounded-full border-4 border-background bg-background sm:h-20 sm:w-20">
              <BannerImage
                src={projectImageUrl(projectId, "logo", currentLogoKey)}
                alt={`Logo do projeto ${projectName}`}
                crop={currentLogoCrop}
                className="rounded-full"
              />
            </div>
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-muted text-muted-foreground sm:h-20 sm:w-20">
              <ImageOff className="h-6 w-6" />
            </div>
          )}
        </div>
      </div>

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Input cru, não o primitivo: `sr-only` + `w-full` do primitivo compõem um absoluto
              de largura da viewport (a ordem das utilities do Tailwind v4 deixava o w-full
              vencer o sr-only) — era o scroll horizontal medido em /dashboard/projetos/[id]. */}
          <input
            ref={logoInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            aria-label="Imagem do logo"
            className="sr-only"
            disabled={busy}
            onChange={() => handleUpload("logo")}
          />
          <input
            ref={bannerInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            aria-label="Imagem de capa"
            className="sr-only"
            disabled={busy}
            onChange={() => handleUpload("banner")}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => bannerInputRef.current?.click()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Enviar capa
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => logoInputRef.current?.click()}
          >
            Enviar logo
          </Button>
          {currentBannerKey && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={openEditor}
            >
              <CropIcon className="h-4 w-4" />
              Recortar capa
            </Button>
          )}
          {currentLogoKey && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={openLogoEditor}
            >
              <CropIcon className="h-4 w-4" />
              {/* "Recortar logo" nao contem "Recortar capa" nem "Tirar logo" (licao da 3.C). */}
              Recortar logo
            </Button>
          )}
          {currentBannerKey && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => handleRemove("banner")}
            >
              <Trash2 className="h-4 w-4" />
              {/* "Tirar" e nao "Remover": o painel de membros, montado no mesmo dialogo, ja tem um
                  botao chamado exatamente "Remover", e `getByRole` casa por substring (licao da
                  3.C). Um rotulo novo nao pode conter o de um controle vizinho. */}
              Tirar capa
            </Button>
          )}
          {currentLogoKey && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => handleRemove("logo")}
            >
              <Trash2 className="h-4 w-4" />
              Tirar logo
            </Button>
          )}
        </div>
      )}

      {editorOpen && (
        <BannerCropEditor
          key={editorSession}
          open
          src={editorSrc}
          alt={`Capa do projeto ${projectName}`}
          initial={pendingFile ? DEFAULT_CROP : currentCrop ?? DEFAULT_CROP}
          onCancel={() => {
            setEditorOpen(false)
            setPendingFile(null)
            if (bannerInputRef.current) bannerInputRef.current.value = ""
          }}
          onSave={handleSaveCrop}
        />
      )}

      {/* DEC-242: o editor do logo usa a MESMA peça com a faixa quadrada (bandAspect 1). */}
      {logoEditorOpen && (
        <BannerCropEditor
          key={logoEditorSession}
          open
          src={logoEditorSrc}
          alt={`Logo do projeto ${projectName}`}
          initial={pendingLogoFile ? DEFAULT_CROP : currentLogoCrop ?? DEFAULT_CROP}
          bandAspect={SQUARE_BAND_ASPECT}
          title="Recorte do logo"
          description={LOGO_SQUARE_DESCRIPTION}
          onCancel={() => {
            setLogoEditorOpen(false)
            setPendingLogoFile(null)
            if (logoInputRef.current) logoInputRef.current.value = ""
          }}
          onSave={handleSaveLogoCrop}
        />
      )}
    </div>
  )
}

function CropIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden="true">
      <path d="M6 0v6H0" strokeLinecap="round" />
      <path d="M18 24v-6h6" strokeLinecap="round" />
      <rect x="3" y="6" width="15" height="12" rx="1" />
    </svg>
  )
}
