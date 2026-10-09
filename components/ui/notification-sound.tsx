"use client"

import { useNotificationSound, NOTIFICATION_POLL_MS } from "@/components/ui/use-notification-sound"

/**
 * Componente de montagem única do som de notificação.
 *
 * Existe separado do hook porque o hook precisa rodar uma vez só no app, e o
 * `NotificationsPanel` é montado duas vezes no cabeçalho (versão de mesa e versão
 * compacta) mais uma no painel administrativo: se o som vivesse no painel, tocaria em
 * dobro ou triplicado. Não renderiza nada.
 */
export function NotificationSound() {
  useNotificationSound()
  return null
}

/** Reexportado para quem quiser testar o intervalo sem importar o hook. */
export { NOTIFICATION_POLL_MS }
