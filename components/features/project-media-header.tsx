"use client"

import { useEffect, useRef, useState } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ImageOff } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { deleteProjectImage, projectImageUrl, uploadProjectImage, type ProjectImageSlot } from "@/lib/api/project-files"
import { BannerImage } from "@/components/ui/banner-image"

interface ProjectMediaHeaderProps {
  projectId: number
  projectName: string
  logoKey?: string | null
  bannerKey?: string | null
  canManage: boolean
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"

export function ProjectMediaHeader({ projectId, projectName, logoKey, bannerKey, canManage }: ProjectMediaHeaderProps) {
  const { toast } = useToast()
  const logoInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [currentLogoKey, setCurrentLogoKey] = useState(logoKey ?? null)
  const [currentBannerKey, setCurrentBannerKey] = useState(bannerKey ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCurrentLogoKey(logoKey ?? null)
    setCurrentBannerKey(bannerKey ?? null)
  }, [projectId, logoKey, bannerKey])

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
      setCurrentLogoKey(state.logoKey)
      setCurrentBannerKey(state.bannerKey)
      input.value = ""
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
    const label = slot === "logo" ? "logo" : "capa"
    if (!confirm(`Remover o ${label} do projeto?`)) return

    setBusy(true)
    try {
      const state = await deleteProjectImage(projectId, slot)
      setCurrentLogoKey(state.logoKey)
      setCurrentBannerKey(state.bannerKey)
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={!canManage}>
            {canManage ? (
              <button
                type="button"
                aria-label="Opções da capa do projeto"
                className="block w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="aspect-[21/9] overflow-hidden rounded-lg border bg-muted">
                  {currentBannerKey ? (
                    <BannerImage src={projectImageUrl(projectId, "banner", currentBannerKey)} alt={`Capa do projeto ${projectName}`} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
                      <ImageOff className="h-5 w-5" />
                      Sem capa
                    </div>
                  )}
                </div>
              </button>
            ) : (
              <div className="aspect-[21/9] overflow-hidden rounded-lg border bg-muted">
                {currentBannerKey ? (
                  <BannerImage src={projectImageUrl(projectId, "banner", currentBannerKey)} alt={`Capa do projeto ${projectName}`} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <ImageOff className="h-5 w-5" />
                    Sem capa
                  </div>
                )}
              </div>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => bannerInputRef.current?.click()} disabled={busy}>Enviar capa</DropdownMenuItem>
            {currentBannerKey && <DropdownMenuItem onClick={() => handleRemove("banner")} disabled={busy}>Tirar capa</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="absolute bottom-0 left-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={!canManage}>
              {canManage ? (
                <button
                  type="button"
                  aria-label="Opções do logo do projeto"
                  className="block h-16 w-16 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-20 sm:w-20"
                >
                  {currentLogoKey ? (
                    <div className="h-16 w-16 rounded-full border-4 border-background bg-background sm:h-20 sm:w-20">
                      <BannerImage src={projectImageUrl(projectId, "logo", currentLogoKey)} alt={`Logo do projeto ${projectName}`} className="rounded-full" />
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-muted text-muted-foreground sm:h-20 sm:w-20">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}
                </button>
              ) : (
                <div>
                  {currentLogoKey ? (
                    <div className="h-16 w-16 rounded-full border-4 border-background bg-background sm:h-20 sm:w-20">
                      <BannerImage src={projectImageUrl(projectId, "logo", currentLogoKey)} alt={`Logo do projeto ${projectName}`} className="rounded-full" />
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-background bg-muted text-muted-foreground sm:h-20 sm:w-20">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}
                </div>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => logoInputRef.current?.click()} disabled={busy}>Enviar logo</DropdownMenuItem>
              {currentLogoKey && <DropdownMenuItem onClick={() => handleRemove("logo")} disabled={busy}>Tirar logo</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {canManage && (
        <>
          <input ref={logoInputRef} type="file" accept={IMAGE_ACCEPT} aria-label="Imagem do logo" className="sr-only" disabled={busy} onChange={() => handleUpload("logo")} />
          <input ref={bannerInputRef} type="file" accept={IMAGE_ACCEPT} aria-label="Imagem de capa" className="sr-only" disabled={busy} onChange={() => handleUpload("banner")} />
        </>
      )}
    </div>
  )
}
