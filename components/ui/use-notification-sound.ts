"use client"

/**
 * Som de notificação, no evento que atualiza o contador do sino.
 *
 * Medido antes de escrever (2026-10-09): o contador NÃO é instantâneo. As duas consultas de
 * `useNotifications` têm `refetchInterval: 60_000`, e o `refetchOnWindowFocus` global está
 * desligado (`shared/providers/query-provider.tsx:17`), então uma notificação criada por
 * outra pessoa leva até um minuto para aparecer no sino, e mais um minuto para a próxima
 * tentativa.
 *
 * O dono acreditava que o contador atualizava direto e pediu o som "praticamente no evento
 * que atualizar o contador". Para o pedido fazer sentido, o evento precisa existir com
 * frequência: a consulta da contagem passou a repetir a cada 5 s (`NOTIFICATION_POLL_MS`).
 * Cinco segundos é o que torna o som utilizável sem transformar o painel em fonte de carga:
 * uma nota nova toca no máximo 5 s depois de nascer.
 *
 * O som toca quando a contagem de NÃO LIDAS SOBE, que é o único sinal de "chegou coisa
 * nova". A primeira leitura não toca: sem um valor anterior, uma contagem diferente de zero
 * seria festa de avaliação na abertura da página. Também não toca quando a contagem cai,
 * que é LEITURA (a pessoa abriu e marcou como lida).
 *
 * Ligado por padrão, pela regra da casa que o dono fixou em 2026-10-09 ("o som LIGADO por
 * padrão, todos"). A chave `dq:som-quest` guarda a preferência, e o interruptor vem depois.
 * O navegador pode segurar o primeiro toque até a pessoa clicar em algo na página, que é o
 * que a política de autoplay exige; disso dá conta o `play()` do seam, que devolve false sem
 * lançar.
 */
import { useEffect, useRef } from "react"

import { useNotifications } from "@/features/notifications"
import { clientStorageKey, readJson, writeJson } from "@/lib/client-storage"
import { playAlertSound } from "@/lib/notifications/alert-sound"

/** Chave da preferência do som de notificação. */
export const QUEST_SOUND_KEY = clientStorageKey("som-quest")

/** A cada quantos segundos a contagem de não lidas é recarregada. */
export const NOTIFICATION_POLL_MS = 5_000

export function useNotificationSound() {
  const { unreadCount } = useNotifications()
  // Última contagem vista, para o somnascer da SUBIDA e não da primeira leitura.
  const previousCountRef = useRef<number | null>(null)
  const enabledRef = useRef(true)

  // A preferência é lida uma vez, fora do render, para não divergir entre servidor e
  // cliente na hidratação (mesmo motivo de `useSessionAlertSound`).
  useEffect(() => {
    enabledRef.current = readJson<boolean>(QUEST_SOUND_KEY, true) === true
  }, [])

  useEffect(() => {
    const previous = previousCountRef.current
    previousCountRef.current = unreadCount
    if (previous === null) return
    if (unreadCount <= previous) return
    if (!enabledRef.current) return
    playAlertSound("quest")
  }, [unreadCount])

  return { unreadCount }
}

/** Liga e desliga a preferência, para o interruptor que vem depois. */
export function setQuestSoundEnabled(value: boolean) {
  writeJson(QUEST_SOUND_KEY, value)
}
