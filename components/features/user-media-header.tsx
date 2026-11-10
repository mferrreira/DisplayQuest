"use client"

import { useEffect, useRef, useState } from "react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ImageOff } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { deleteUserImage, uploadUserImage, userImageUrl, type UserImageSlot } from "@/lib/api/user-images"
import { BannerImage } from "@/components/ui/banner-image"

interface UserMediaHeaderProps {
  userId: number
  userName: string
  bannerKey?: string | null
  avatarKey?: string | null
  canEdit: boolean
  onBannerChange: (bannerKey: string | null) => void
  onAvatarKeyChange?: (avatarKey: string | null) => void
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"

export function UserMediaHeader({
  userId,
  userName,
  bannerKey,
  avatarKey,
  canEdit,
  onBannerChange,
  onAvatarKeyChange,
}: UserMediaHeaderProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [currentKey, setCurrentKey] = useState(bannerKey ?? null)
  const [currentAvatarKey, setCurrentAvatarKey] = useState(avatarKey ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCurrentKey(bannerKey ?? null)
    setCurrentAvatarKey(avatarKey ?? null)
  }, [userId, bannerKey, avatarKey])

  function applyBannerKey(next: string | null) {
    setCurrentKey(next)
    onBannerChange(next)
  }

  function applyAvatarKey(next: string | null) {
    setCurrentAvatarKey(next)
    onAvatarKeyChange?.(next)
  }

  async function handleUpload(slot: UserImageSlot) {
    const input = slot === "banner" ? inputRef.current : avatarInputRef.current
    const file = input?.files?.[0]
    if (!file) return

    setBusy(true)
    try {
      const state = await uploadUserImage(userId, slot, file)
      applyBannerKey(state.bannerKey)
      applyAvatarKey(state.avatarKey)
      input.value = ""
      toast({ title: slot === "banner" ? "Capa atualizada" : "Avatar atualizado", description: file.name })
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

  async function handleRemove(slot: UserImageSlot) {
    const label = slot === "banner" ? "capa" : "avatar"
    if (!confirm(`Remover o ${label} do perfil?`)) return

    setBusy(true)
    try {
      const state = await deleteUserImage(userId, slot)
      applyBannerKey(state.bannerKey)
      applyAvatarKey(state.avatarKey)
      toast({ title: slot === "banner" ? "Capa removida" : "Avatar removido" })
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
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={!canEdit}>
          {canEdit ? (
            <button
              type="button"
              aria-label="Opções da capa do perfil"
              className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className={`aspect-[21/9] overflow-hidden ${currentKey ? "bg-muted" : "bg-primary/10"}`}>
                {currentKey ? (
                  <BannerImage src={userImageUrl(userId, "banner", currentKey)} alt={`Capa de ${userName}`} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center gap-2 text-sm font-medium text-primary/70">
                    <ImageOff className="h-5 w-5" />
                    Sem capa
                  </div>
                )}
              </div>
            </button>
          ) : (
            <div className={`aspect-[21/9] overflow-hidden ${currentKey ? "bg-muted" : "bg-primary/10"}`}>
              {currentKey ? (
                <BannerImage src={userImageUrl(userId, "banner", currentKey)} alt={`Capa de ${userName}`} />
              ) : (
                <div className="flex h-full w-full items-center justify-center gap-2 text-sm font-medium text-primary/70">
                  <ImageOff className="h-5 w-5" />
                  Sem capa
                </div>
              )}
            </div>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-background/95">
          <DropdownMenuItem onClick={() => inputRef.current?.click()} disabled={busy}>Enviar capa</DropdownMenuItem>
          {currentKey && <DropdownMenuItem onClick={() => handleRemove("banner")} disabled={busy}>Tirar capa</DropdownMenuItem>}
          <DropdownMenuItem onClick={() => avatarInputRef.current?.click()} disabled={busy}>Enviar avatar</DropdownMenuItem>
          {currentAvatarKey && <DropdownMenuItem onClick={() => handleRemove("avatar")} disabled={busy}>Tirar avatar</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      {canEdit && (
        <>
          <input ref={inputRef} type="file" accept={IMAGE_ACCEPT} aria-label="Imagem de capa do perfil" className="sr-only" disabled={busy} onChange={() => handleUpload("banner")} />
          <input ref={avatarInputRef} type="file" accept={IMAGE_ACCEPT} aria-label="Imagem do avatar do perfil" className="sr-only" disabled={busy} onChange={() => handleUpload("avatar")} />
        </>
      )}
    </div>
  )
}
