/**
 * plan-v3 — costura de **notificação nativa** do navegador (F1b, onda 5).
 *
 * Este arquivo é criado na Onda 2 (2.C) e **ligado** na Onda 5 (5.A), que hoje está
 * bloqueada por BLK-01: a instância do laboratório é HTTP num IP de rede, e Chrome e
 * Firefox recusam o pedido de permissão fora de contexto seguro. Criar a costura agora, com
 * teste, é o que faz a onda 5 virar um commit de ligação em vez de um redesenho.
 *
 * Ele fica separado de `alert-sound.ts` porque os dois canais falham de maneiras
 * distintas: o som depende de WebAudio e da política de autoplay; a notificação nativa
 * depende de permissão, de contexto seguro e da política do próprio sistema operacional.
 *
 * Regras que a costura garante, para que o ponto de ligação não precise lembrá-las:
 *  - **nada lança**: sem `Notification`, permissão negada ou construtor quebrado, toda
 *    função devolve um valor neutro (`false`/`"unsupported"`) e a interface segue só com
 *    o alerta da Onda 2;
 *  - **a permissão só é pedida a partir de um gesto**, porque fora de contexto seguro o
 *    pedido é recusado e, em contexto seguro, o pedido fora de gesto é ignorado pelo
 *    navegador;
 *  - **dedupe por `tag`**: uma pausa automática não empilha notificações. A anterior com a
 *    mesma tag é fechada antes de a nova aparecer.
 */

/** Permissão devolvida pela costura, já com o caso "este navegador não tem". */
export type BrowserNotificationPermission = "granted" | "denied" | "default" | "unsupported"

type NotificationLike = {
  close: () => void
}
type NotificationConstructor = new (
  title: string,
  options?: { body?: string; tag?: string; icon?: string },
) => NotificationLike

/** Notificações vivas, por tag. Substituída a cada import novo em teste. */
const live = new Map<string, NotificationLike>()

function notificationCtor(): NotificationConstructor | null {
  if (typeof window === "undefined") return null
  const ctor = (window as unknown as { Notification?: NotificationConstructor }).Notification
  return typeof ctor === "function" ? ctor : null
}

/** `true` quando existe API de notificação neste navegador. Não diz se há permissão. */
export function isBrowserNotificationSupported(): boolean {
  return notificationCtor() !== null
}

/**
 * `true` quando este navegador pode mostrar notificação **aqui e agora** — isto é, há
 * contexto seguro (`window.isSecureContext`) e a permissão já foi concedida. É a condição
 * que o ponto de ligação precisa antes de tentar notificar.
 */
export function canNotifyNow(): boolean {
  if (!isBrowserNotificationSupported()) return false
  const scope = window as unknown as { isSecureContext?: boolean }
  if (scope.isSecureContext === false) return false
  return browserNotificationPermission() === "granted"
}

/** Permissão atual, normalizada. `unsupported` quando não há API. */
export function browserNotificationPermission(): BrowserNotificationPermission {
  const ctor = notificationCtor() as
    | (NotificationConstructor & { permission?: BrowserNotificationPermission })
    | null
  if (!ctor) return "unsupported"
  // Navegadores sem propriedade estática (Safari antigo) contam como "ainda não pedida".
  return ctor.permission ?? "default"
}

/**
 * Pede a permissão. Deve ser chamada de um gesto da pessoa (botão "ativar avisos"), nunca
 * ao carregar a página. Resolve com a permissão resultante; falha de qualquer maneira
 * resolve como `"unsupported"` em vez de rejeitar.
 */
export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  const ctor = notificationCtor()
  if (!ctor) return "unsupported"
  const withRequest = ctor as NotificationConstructor & {
    requestPermission?: () => Promise<BrowserNotificationPermission> | BrowserNotificationPermission
  }
  if (typeof withRequest.requestPermission !== "function") return "unsupported"
  try {
    const result = await withRequest.requestPermission()
    return result ?? "default"
  } catch {
    return "denied"
  }
}

/**
 * Mostra a notificação. Devolve `false` sem lançar quando não dá (sem API, sem
 * permissão, fora de contexto seguro, ou se o navegador recusar construir).
 *
 * Com `tag`, uma notificação anterior de mesma tag é fechada primeiro: a pessoa vê a mais
 * recente em vez de uma pilha de pausas iguais.
 */
export function showBrowserNotification(
  title: string,
  options: { body?: string; tag?: string; icon?: string } = {},
): boolean {
  if (!canNotifyNow()) return false
  const ctor = notificationCtor()
  if (!ctor) return false
  try {
    if (options.tag) {
      const previous = live.get(options.tag)
      previous?.close()
      live.delete(options.tag)
    }
    const notification = new ctor(title, options)
    if (options.tag) live.set(options.tag, notification)
    return true
  } catch {
    return false
  }
}

/** Fecha a notificação viva da tag, se houver. Idempotente. */
export function closeBrowserNotification(tag: string): boolean {
  const notification = live.get(tag)
  if (!notification) return false
  live.delete(tag)
  try {
    notification.close()
    return true
  } catch {
    return false
  }
}

/** Tags com notificação viva. Usado por teste e por diagnóstico. */
export function liveBrowserNotificationTags(): string[] {
  return [...live.keys()]
}