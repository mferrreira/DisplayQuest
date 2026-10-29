"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ImageOff, Loader2, Trash2, Upload } from "lucide-react"
import { useToast } from "@/contexts/use-toast"
import { deleteUserImage, uploadUserImage, userImageUrl } from "@/lib/api/user-images"

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
 * O estado da chave é local e sobe para a página por `onBannerChange`: é a chave que quebra o cache
 * do navegador quando a capa muda, e é ela que diz se o slot tem imagem.
 */
interface UserMediaHeaderProps {
  userId: number
  userName: string
  bannerKey?: string | null
  canEdit: boolean
  onBannerChange: (bannerKey: string | null) => void
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif"

export function UserMediaHeader({ userId, userName, bannerKey, canEdit, onBannerChange }: UserMediaHeaderProps) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [currentKey, setCurrentKey] = useState(bannerKey ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCurrentKey(bannerKey ?? null)
  }, [userId, bannerKey])

  const applyKey = useCallback(
    (next: string | null) => {
      setCurrentKey(next)
      onBannerChange(next)
    },
    [onBannerChange],
  )

  async function handleUpload() {
    const file = inputRef.current?.files?.[0]
    if (!file) {
      toast({ title: "Nada para enviar", description: "Escolha a imagem da capa primeiro." })
      return
    }

    setBusy(true)
    try {
      const state = await uploadUserImage(userId, "banner", file)
      applyKey(state.bannerKey)
      if (inputRef.current) inputRef.current.value = ""
      toast({ title: "Capa atualizada", description: file.name })
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao enviar capa",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!confirm("Remover a capa do perfil?")) return

    setBusy(true)
    try {
      const state = await deleteUserImage(userId, "banner")
      applyKey(state.bannerKey)
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
  return (
    <div className="relative">
      {/* S05 (R4): faixa 16:9 (`aspect-video`), sem altura fixa. */}
      <div className={`aspect-video overflow-hidden ${currentKey ? "bg-muted" : "bg-primary/10"}`}>
        {currentKey ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={userImageUrl(userId, "banner", currentKey)}
              alt={`Capa de ${userName}`}
              className="h-full w-full object-cover"
            />
          </>
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
            onChange={() => handleUpload()}
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
          )}
        </div>
      )}
    </div>
  )
}
