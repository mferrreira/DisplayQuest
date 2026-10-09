/**
 * Sons de alerta gerados por WebAudio, sem asset binário.
 *
 * Por que sintetizar e não guardar um arquivo: um `.wav` de alerta entraria no
 * repositório como binário, precisaria de empacotamento, e o tamanho do app cresceria por
 * causa de um toque. Um punhado de osciladores com envelope faz o mesmo trabalho.
 *
 * Por que isto é uma costura (`lib/`) e não lógica dentro do componente: o componente
 * decide *quando* alertar; este módulo decide *se consegue*, e nunca lança. Browser sem
 * WebAudio, contexto recusado pela política de autoplay ou áudio bloqueado em modo
 * privado são respostas `false` — a interface segue funcionando em silêncio.
 *
 * O contexto é criado uma vez e reaproveitado: o navegador descarta contextos antigos
 * depois de um punhado de criações, e um toque por pausa programada criaria um por hora
 * de sessão.
 *
 * Dois sons, por pedido do dono em 2026-10-09:
 *  - `pause`: o toque da pausa de sessão. Era o dois-bipes descendente de 660/440 Hz, e o
 *    dono mediu como baixo e pouco chamativo três vezes no mesmo dia (0.16, 0.35, 0.75 de
 *    volume, um depois do outro). A versão atual é um "plim" de uma nota só, agudo e
 *    alongado: uma senoide que SOBE de 1046 Hz (C6) a 1568 Hz (G6) nos primeiros 120 ms e
 *    decai até o silêncio em 550 ms, com um harmônico fino em 2093 Hz para dar brilho. A
 *    subida de frequência no ataque é o que faz o ouvido reconhecer o toque: um bip reto
 *    em 1 kHz parece campainha, e a inflexão para cima soa como o "plim" do iPhone.
 *    Volume no talo (1.0), também por pedido do dono — quem está no computador ajusta o
 *    volume do sistema.
 *  - `quest`: o toque antigo, preservado de propósito. Dois bipes curtos e descendentes,
 *    660 Hz e 440 Hz, que é o formato certo para um aviso que não precisa competir com o
 *    barulho do laboratório. Ele passa a ser o som de notificação do quest.
 */

type AudioContextCtor = new () => AudioContext

interface Tone {
  /** Hz no início da nota. */
  frequency: number
  /** Deslocamento do início, em segundos. */
  offset: number
  /** Duração, em segundos. */
  duration: number
  /** Hz no fim da nota, quando o tom desliza durante a execução. */
  glideTo?: number
  /** Duração do deslize, em segundos. */
  glideTime?: number
  /** Fração do volume de pico deste tom. Harmônico entra mais baixo que o fundamental. */
  gainScale?: number
}

/** Ataque do envelope, em segundos. Curto o bastante para o toque parecer seco. */
const ATTACK_SEC = 0.015

/**
 * Volume de pico, em escala de 0 a 1 do `GainNode`. É 1 (volume do talo) por decisão do
 * dono em 2026-10-09: ele mediu 0.16, 0.35 e 0.75 como "continuou baixo" e preferiu o
 * som no máximo, com cada pessoa ajustando o volume do próprio computador.
 */
const PEAK_GAIN = 1

export type AlertSound = "pause" | "quest"

/** Pausa de sessão: um "plim" de uma nota, agudo e alongado. */
const PAUSE_TONES: Tone[] = [
  { frequency: 1046, offset: 0, duration: 0.55, glideTo: 1568, glideTime: 0.12 },
  { frequency: 2093, offset: 0, duration: 0.35, gainScale: 0.18 },
]

/** Notificação do quest: os dois bipes descendentes que eram o som da pausa. */
const QUEST_TONES: Tone[] = [
  { frequency: 660, offset: 0, duration: 0.16 },
  { frequency: 440, offset: 0.2, duration: 0.3 },
]

const TONES: Record<AlertSound, Tone[]> = {
  pause: PAUSE_TONES,
  quest: QUEST_TONES,
}

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null
  const scope = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return scope.AudioContext ?? scope.webkitAudioContext ?? null
}

/** `true` quando este navegador consegue tocar som. Não diz se o autoplay vai deixar. */
export function isAlertSoundSupported(): boolean {
  return audioContextCtor() !== null
}

let cachedContext: AudioContext | null = null

/**
 * Toca o som. Devolve `false` — sem lançar — quando não dá para tocar: fora do cliente,
 * sem WebAudio, contexto bloqueado, ou qualquer erro do próprio navegador.
 *
 * O contexto pode nascer `suspended`, que é o que a política de autoplay faz até haver um
 * gesto da pessoa. O `resume` é pedido e o erro engolido: a tentativa é o que importa, e
 * quem insiste é o chamador, pela preferência.
 */
export function playAlertSound(sound: AlertSound = "pause"): boolean {
  const Ctor = audioContextCtor()
  if (!Ctor) return false

  try {
    const context = cachedContext ?? new Ctor()
    cachedContext = context

    if (context.state === "suspended") {
      void Promise.resolve(context.resume()).catch(() => {})
    }

    const tones = TONES[sound] ?? TONES.pause
    const start = context.currentTime

    for (const tone of tones) {
      const oscillator = context.createOscillator()
      const envelope = context.createGain()
      const peak = PEAK_GAIN * (tone.gainScale ?? 1)
      const at = start + tone.offset

      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(tone.frequency, at)
      // O deslize é o que dá o caráter do toque: sem ele, uma senoide fixa em 1 kHz parece
      // campainha de porta em vez de "plim".
      if (tone.glideTo !== undefined && tone.glideTime !== undefined) {
        oscillator.frequency.linearRampToValueAtTime(tone.glideTo, at + tone.glideTime)
      }

      // Envelope: ataque curto e decaimento exponencial. Sem o ataque o toque estala no
      // início, e sem o decaimento exponencial ele corta seco no fim.
      envelope.gain.setValueAtTime(0.0001, at)
      envelope.gain.linearRampToValueAtTime(peak, at + ATTACK_SEC)
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + tone.duration)

      oscillator.connect(envelope)
      envelope.connect(context.destination)
      oscillator.start(at)
      oscillator.stop(at + tone.duration + 0.02)
    }

    return true
  } catch {
    // Contexto derrubado, cota do navegador, qualquer coisa: silêncio.
    return false
  }
}
