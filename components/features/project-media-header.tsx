"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ImageOff, Loader2, Trash2, Upload } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import {
  deleteProjectImage,
  projectImageUrl,
  updateProjectBannerCrop,
  uploadProjectImage,
  type ProjectImageSlot,
} from "@/lib/api/project-files"
import { BannerCropEditor } from "@/components/features/banner-crop-editor"
import { BannerImage } from "@/components/ui/banner-image"
import { bannerCropFromColumns, type BannerCropParams } from "@/backend/domain"

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
 * O logo segue o caminho direto de upload (slot de círculo, não faixa).
 */
interface ProjectMediaHeaderProps {
  projectId: number
  projectName: string
  logoKey?: string | null
  bannerKey?: string | null
  bannerCrop?: BannerCropParams | null
  canManage: boolean
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"
const DEFAULT_CROP: BannerCropParams = { x: 0.5, y: 0.5, zoom: 1 }

export function ProjectMediaHeader({
  projectId,
  projectName,
  logoKey,
  bannerKey,
  bannerCrop,
  canManage,
}: ProjectMediaHeaderProps) {
  const { toast } = useToast()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [currentLogoKey, setCurrentLogoKey] = useState(logoKey ?? null)
  const [currentBannerKey, setCurrentBannerKey] = useState(bannerKey ?? null)
  const [currentCrop, setCurrentCrop] = useState<BannerCropParams | null>(bannerCrop ?? null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [editorSession, setEditorSession] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // O diálogo é o mesmo componente ao abrir outro projeto: sem isto, a tela mostraria a imagem do
  // projeto anterior até a próxima subida.
  useEffect(() => {
    setCurrentLogoKey(logoKey ?? null)
    setCurrentBannerKey(bannerKey ?? null)
    setCurrentCrop(bannerCrop ?? null)
  }, [projectId, logoKey, bannerKey, bannerCrop])

  const applyState = useCallback((state: { logoKey: string | null; bannerKey: string | null }) => {
    setCurrentLogoKey(state.logoKey)
    setCurrentBannerKey(state.bannerKey)
  }, [])

  function openEditor() {
    setEditorSession((n) => n + 1)
    setEditorOpen(true)
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

    // A capa passa pelo editor 21:9 antes de escrever (DEC-241); o logo vai direto.
    if (slot === "banner") {
      setPendingFile(file)
      openEditor()
      return
    }

    setBusy(true)
    try {
      const state = await uploadProjectImage(projectId, slot, file)
      applyState(state)
      if (input) input.value = ""
      toast({ title: slot === "logo" ? "Logo atualizado" : "Capa atualizada", description: file.name })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao enviar imagem",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
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
      setCurrentBannerKey(saved.bannerKey)
      setCurrentCrop(
        saved.bannerCropX === null || saved.bannerCropY === null || saved.bannerCropZoom === null
          ? null
          : { x: saved.bannerCropX, y: saved.bannerCropY, zoom: saved.bannerCropZoom },
      )
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

  async function handleRemove(slot: ProjectImageSlot) {
    if (!confirm(slot === "logo" ? "Remover o logo do projeto?" : "Remover a capa do projeto?")) return

    setBusy(true)
    try {
      const state = await deleteProjectImage(projectId, slot)
      applyState(state)
      if (slot === "banner") setCurrentCrop(null)
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
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={projectImageUrl(projectId, "logo", currentLogoKey)}
                alt={`Logo do projeto ${projectName}`}
                className="h-16 w-16 rounded-full border-4 border-background bg-background object-cover sm:h-20 sm:w-20"
              />
            </>
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
