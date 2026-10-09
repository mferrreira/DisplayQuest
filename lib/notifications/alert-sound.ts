/**
 * Sons de alerta, agora arquivos de áudio em `public/sons/`.
 *
 * Histórico desta troca, porque ele explica o desenho: o som era sintetizado em WebAudio
 * (duas senoides com envelope). Em 2026-10-09 o dono mediu o bip como baixo três vezes no
 * mesmo dia (0.16, depois 0.35, depois 0.75 de volume, um atrás do outro), e a quarta
 * rodada foi de desenho: "mais chamativo, mais agudo e mais alongado, sem virar alarme".
 * A versão sintetizada seguinte, um plim de uma nota que subia de 1046 Hz a 1568 Hz, ele
 * também não gostou. A conclusão dele é a que está aqui: em vez de insistir em oscilador,
 * usar som gravado de base livre.
 *
 * Os dois arquivos vêm do Mixkit, sob a Mixkit License (uso livre, inclusive comercial, sem
 * exigir atribuição). A licença e a origem de cada arquivo estão em `public/sons/LICENSE.md`.
 *
 * Dois sons, porque são dois eventos diferentes:
 *  - `pause`: a pausa da sessão de trabalho, inclusive a pausa automática das 17h.
 *  - `quest`: notificação do quest, que toca quando uma notificação não lida chega.
 *
 * Regra da casa (dono, 2026-10-09): som **LIGADO por padrão**, os dois. Cada preferência
 * tem sua chave em `lib/client-storage.ts`; os interruptores de ligar e desligar vêm
 * depois, e até lá quem quiser silêncio mexe na chave ou no volume do sistema.
 *
 * Isto continua sendo uma costura (`lib/`) e não lógica de componente: o componente decide
 * *quando* tocar, e este módulo decide *se consegue*, sem nunca lançar. Navegador sem
 * `Audio`, arquivo que não carregou ou `play()` recusado pela política de autoplay são
 * respostas `false`, e a interface segue funcionando em silêncio.
 */

export type AlertSound = "pause" | "quest"

/** Caminhos dos arquivos, relativos a `public/`. */
const SOUND_FILES: Record<AlertSound, string> = {
  pause: "/sons/pausa.mp3",
  quest: "/sons/notificacao.mp3",
}

/** Chaves de preferência, uma por som, para os interruptores que vêm depois. */
export const ALERT_SOUND_KEYS: Record<AlertSound, string> = {
  pause: "dq:som-pausa",
  quest: "dq:som-quest",
}

/**
 * Um `Audio` por som, criado no primeiro uso e reaproveitado.
 *
 * A criação é preguiçosa de propósito: o módulo é importado por caminhos que rodam no
 * servidor (o `floating-session-timer` é cliente, mas o seam não pode assumir isso), e
 * `new Audio()` no servidor não existe.
 */
const elements = new Map<AlertSound, HTMLAudioElement>()

function elementFor(sound: AlertSound): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null
  const cached = elements.get(sound)
  if (cached) return cached
  try {
    const element = new Audio(SOUND_FILES[sound])
    element.preload = "auto"
    elements.set(sound, element)
    return element
  } catch {
    // Construtor que lança (storage cheio, plataforma sem áudio): segue em silêncio.
    return null
  }
}

/** `true` quando este navegador tem API de áudio. Não diz se o autoplay vai deixar. */
export function isAlertSoundSupported(): boolean {
  return typeof Audio !== "undefined"
}

/**
 * Toca o som. Devolve `false`, sem lançar, quando não dá para tocar: fora do cliente, sem
 * API de áudio, ou `play()` recusado pelo navegador.
 *
 * `currentTime = 0` antes de tocar é o que permite dois toques seguidos: sem isso, o
 * segundo pedido encontraria o arquivo ainda rolando e seria ignorado em silêncio, e a
 * pausa automática das 17h costuma ser seguida de perto por outra.
 */
export function playAlertSound(sound: AlertSound = "pause"): boolean {
  const element = elementFor(sound)
  if (!element) return false

  try {
    element.currentTime = 0
    const played = element.play()
    // `play()` devolve promise só onde o autoplay é bloqueável. Onde não devolve, o toque
    // já saiu.
    if (played && typeof played.then === "function") {
      played.then(
        () => {},
        () => {},
      )
    }
    return true
  } catch {
    // Elemento quebrado, arquivo removido, qualquer coisa: silêncio.
    return false
  }
}

/** Som de pausa da sessão. Atalho para quem só precisa deste. */
export function playPauseSound(): boolean {
  return playAlertSound("pause")
}

/** Som de notificação do quest. Atalho para quem só precisa deste. */
export function playQuestSound(): boolean {
  return playAlertSound("quest")
}
