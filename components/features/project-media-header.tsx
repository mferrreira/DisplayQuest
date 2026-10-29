"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ImageOff, Loader2, Trash2, Upload } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import {
  deleteProjectImage,
  projectImageUrl,
  uploadProjectImage,
  type ProjectImageSlot,
} from "@/lib/api/project-files"

/**
 * V5-2d (DEC-102) — capa e logo do projeto, no topo do diálogo de detalhe.
 *
 * O binário mora no bucket e chega por `/api/projects/<id>/images/<slot>/file`, rota que aplica a
 * regra de acesso do projeto (a sessão vai pelo cookie, então a URL serve num `<img>`).
 *
 * O estado das duas chaves é local e nasce do `project` que o diálogo recebeu. Local de propósito:
 * a lista de projetos não mostra imagem, e fazer a subida atravessar três níveis de estado para
 * atualizar uma tela que não mostra a imagem seria estado a mais sem uso.
 */
interface ProjectMediaHeaderProps {
  projectId: number
  projectName: string
  logoKey?: string | null
  bannerKey?: string | null
  canManage: boolean
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"

export function ProjectMediaHeader({
  projectId,
  projectName,
  logoKey,
  bannerKey,
  canManage,
}: ProjectMediaHeaderProps) {
  const { toast } = useToast()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [currentLogoKey, setCurrentLogoKey] = useState(logoKey ?? null)
  const [currentBannerKey, setCurrentBannerKey] = useState(bannerKey ?? null)
  const [busy, setBusy] = useState(false)

  // O diálogo é o mesmo componente ao abrir outro projeto: sem isto, a tela mostraria a imagem do
  // projeto anterior até a próxima subida.
  useEffect(() => {
    setCurrentLogoKey(logoKey ?? null)
    setCurrentBannerKey(bannerKey ?? null)
  }, [projectId, logoKey, bannerKey])

  const applyState = useCallback((state: { logoKey: string | null; bannerKey: string | null }) => {
    setCurrentLogoKey(state.logoKey)
    setCurrentBannerKey(state.bannerKey)
  }, [])

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

  return (
    <div className="space-y-3">
      <div className="relative pb-8">
        {/* S05 (R4): a faixa é 16:9 (`aspect-video`), não altura fixa — o logo sobreposto
            continua fora da faixa pelo `pb-8` do contêiner. */}
        <div className="aspect-video overflow-hidden rounded-lg border bg-muted">
          {currentBannerKey ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={projectImageUrl(projectId, "banner", currentBannerKey)}
                alt={`Capa do projeto ${projectName}`}
                className="h-full w-full object-cover"
              />
            </>
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
    </div>
  )
}
