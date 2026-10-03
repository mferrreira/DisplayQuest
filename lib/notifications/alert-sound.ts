/**
 * plan-v3 OND2-C (DEC-36) — som de pausa gerado por WebAudio, sem asset binário.
 *
 * Por que sintetizar e não guardar um arquivo: um `.wav` de alerta entraria no
 * repositório como binário, precisaria de empacotamento, e o tamanho do app cresceria por
 * causa de um bip. Duas senoides com envelope de 20 ms fazem o mesmo trabalho em três
 * linhas, e continuam audíveis quando o volume do sistema é baixo.
 *
 * Por que isto é uma costura (`lib/`) e não lógica dentro do componente: o componente
 * decide *quando* alertar; este módulo decide *se consegue*, e nunca lança. Browser sem
 * WebAudio, contexto recusado pela política de autoplay ou áudio bloqueado em modo
 * privado são respostas `false` — a interface segue funcionando em silêncio.
 *
 * O contexto é criado uma vez e reaproveitado: o navegador descarta contextos antigos
 * depois de um punhado de criações, e um bip por pausa programada criaria um por hora de
 * sessão.
 */

type AudioContextCtor = new () => AudioContext

interface Tone {
  /** Hz. */
  frequency: number
  /** Deslocamento do início, em segundos. */
  offset: number
  /** Duração, em segundos. */
  duration: number
}

/** Volume de pico. Baixo de propósito: isto toca sozinho, em laboratório aberto. */
const PEAK_GAIN = 0.16

export type AlertSound = "pause"

/** Pausa: dois tons descendentes e curtos, como o bipe de um aparelho que perdeu o horário. */
const TONES: Record<AlertSound, Tone[]> = {
  pause: [
    { frequency: 660, offset: 0, duration: 0.16 },
    { frequency: 440, offset: 0.2, duration: 0.3 },
  ],
}

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null
  const scope = window as unknown as {
    AudioContext?: AudioContextCtor
    webkitAudioContext?: AudioContextCtor
  }
  return scope.AudioContext ?? scope.webkitAudioContext ?? null
}

/** `true` quando este navegador consegue tocar o som. Não diz se o autoplay vai deixar. */
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

      oscillator.type = "sine"
      oscillator.frequency.value = tone.frequency

      // Envelope: ataque curto e decaimento exponencial. Sem ele o bip estala no fim.
      envelope.gain.setValueAtTime(0.0001, start + tone.offset)
      envelope.gain.linearRampToValueAtTime(PEAK_GAIN, start + tone.offset + 0.02)
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + tone.offset + tone.duration)

      oscillator.connect(envelope)
      envelope.connect(context.destination)
      oscillator.start(start + tone.offset)
      oscillator.stop(start + tone.offset + tone.duration + 0.02)
    }

    return true
  } catch {
    // Contexto derrubado, cota do navegador, qualquer coisa: silêncio.
    return false
  }
}