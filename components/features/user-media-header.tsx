"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ImageOff, Loader2, Trash2, Upload } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { deleteUserImage, uploadUserImage, updateUserBannerCrop, userImageUrl } from "@/lib/api/user-images"
import { BannerCropEditor } from "@/components/features/banner-crop-editor"
import { BannerImage } from "@/components/ui/banner-image"
import type { BannerCropParams } from "@/backend/domain"

/**
 * V5-3 (DEC-137) — capa do perfil, no topo do cartão "Meu Perfil".
 *
 * O binário mora no bucket e chega por `/api/users/<id>/images/banner/file`, rota autenticada (a
 * sessão vai pelo cookie, então a URL serve num `<img>`). A leitura é aberta ao autenticado — é o
 * pódio do ranking que renderiza a capa das outras pessoas.
 *
 * Escrita é a autoridade do use case (`self OU MANAGE_USERS`); `canEdit` só decide o que aparece na
 * tela, porque a tela não consulta a gestão de usuários (DEC-92: quem nega de verdade é o servidor).
 *
 * plan-v12 (DEC-239/241, R7): escolhido o arquivo, o editor de recorte abre sobre o ORIGINAL — a
 * faixa renderiza pela peça única `BannerImage` com os parâmetros gravados (`bannerCrop*`), e o
 * "Recortar capa" reabre o editor sobre o binário que está no bucket, nunca sobre o recorte.
 * Salvar a capa nova zera o recorte no servidor (o original mudou); salvar só o recorte grava as
 * três colunas pela rota `.../banner/crop`.
 */
interface UserMediaHeaderProps {
  userId: number
  userName: string
  bannerKey?: string | null
  bannerCrop?: BannerCropParams | null
  canEdit: boolean
  onBannerChange: (bannerKey: string | null) => void
  onCropChange?: (crop: BannerCropParams | null) => void
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"
const DEFAULT_CROP: BannerCropParams = { x: 0.5, y: 0.5, zoom: 1 }

export function UserMediaHeader({
  userId,
  userName,
  bannerKey,
  bannerCrop,
  canEdit,
  onBannerChange,
  onCropChange,
}: UserMediaHeaderProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [currentKey, setCurrentKey] = useState(bannerKey ?? null)
  const [currentCrop, setCurrentCrop] = useState<BannerCropParams | null>(bannerCrop ?? null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [editorSession, setEditorSession] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCurrentKey(bannerKey ?? null)
    setCurrentCrop(bannerCrop ?? null)
  }, [userId, bannerKey, bannerCrop])

  const applyKey = useCallback(
    (next: string | null) => {
      setCurrentKey(next)
      onBannerChange(next)
    },
    [onBannerChange],
  )

  const applyCrop = useCallback(
    (next: BannerCropParams | null) => {
      setCurrentCrop(next)
      onCropChange?.(next)
    },
    [onCropChange],
  )

  function openEditor() {
    setEditorSession((n) => n + 1)
    setEditorOpen(true)
  }

  async function handleSave(params: BannerCropParams) {
    const uploading = pendingFile !== null
    const fileName = pendingFile?.name
    setBusy(true)
    try {
      if (pendingFile) {
        await uploadUserImage(userId, "banner", pendingFile)
        setPendingFile(null)
        if (inputRef.current) inputRef.current.value = ""
      }
      const saved = await updateUserBannerCrop(userId, params)
      applyKey(saved.bannerKey)
      applyCrop(
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

  async function handleRemove() {
    if (!confirm("Remover a capa do perfil?")) return

    setBusy(true)
    try {
      const state = await deleteUserImage(userId, "banner")
      applyKey(state.bannerKey)
      applyCrop(null)
      toast({ title: "Capa removida" })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao remover capa",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  // V6-7 (reimaginacao da tela): a capa deixa de ser uma caixa solta acima do avatar e passa a ser
  // a faixa do hero — o avatar do cartao sobrepoe a borda inferior (mesmo desenho do cabecalho de
  // midia do projeto). Os controles viram um par de chips sobre a faixa, para o hero ler como um
  // objeto so; o `sr-only` dos inputs e os rotulos nao mudam (sao o que o teste fixa).
  const editorSrc = pendingFile
    ? (typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(pendingFile) : "")
    : userImageUrl(userId, "banner", currentKey)

  return (
    <div className="relative">
      {/* S04 (R4, DEC-240): faixa 21:9 (`aspect-[21/9]`), sem altura fixa. */}
      <div className={`aspect-[21/9] overflow-hidden ${currentKey ? "bg-muted" : "bg-primary/10"}`}>
        {currentKey ? (
          <BannerImage
            src={userImageUrl(userId, "banner", currentKey)}
            alt={`Capa de ${userName}`}
            crop={currentCrop}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center gap-2 text-sm font-medium text-primary/70">
            <ImageOff className="h-5 w-5" />
            Sem capa
          </div>
        )}
      </div>

      {canEdit && (
        <div className="absolute right-3 top-3 z-10 flex flex-wrap items-center gap-2">
          {/* Input cru (mesmo motivo do project-media-header): sr-only + w-full do
              primitivo compunham um absoluto largo e estouravam a viewport. */}
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            aria-label="Imagem de capa do perfil"
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              setPendingFile(file)
              openEditor()
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            className="bg-background/90 backdrop-blur"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Enviar capa
          </Button>
          {currentKey && (
            <>
              <Button
                size="sm"
                variant="secondary"
                className="bg-background/90 backdrop-blur"
                disabled={busy}
                onClick={openEditor}
              >
                <CropIcon className="h-4 w-4" />
                Recortar capa
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="bg-background/90 backdrop-blur"
                disabled={busy}
                onClick={handleRemove}
              >
                <Trash2 className="h-4 w-4" />
                {/* "Tirar" e nao "Remover": o cartao de foto do mesmo perfil ja tem o botao "Remover
                    Foto Atual", e `getByRole` casa por substring (licao da 3.C). */}
                Tirar capa
              </Button>
            </>
          )}
        </div>
      )}

      {editorOpen && (
        <BannerCropEditor
          key={editorSession}
          open
          src={editorSrc}
          alt={`Capa de ${userName}`}
          initial={pendingFile ? DEFAULT_CROP : currentCrop ?? DEFAULT_CROP}
          onCancel={() => {
            setEditorOpen(false)
            setPendingFile(null)
            if (inputRef.current) inputRef.current.value = ""
          }}
          onSave={handleSave}
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
