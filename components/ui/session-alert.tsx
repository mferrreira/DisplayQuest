"use client"

/**
 * plan-v3 OND2-C — alerta de pausa que funciona em HTTP (F1a de DEC-35).
 *
 * São duas coisas, e as duas nascem da mesma medição: o cronômetro **colapsado** não
 * sinalizava nada (uma sessão pausada às 12:00 era visualmente idêntica a uma sessão ativa
 * às 11:00), e o aviso da pausa automática só existia dentro de um diálogo modal — que
 * ninguém vê se está com a aba em segundo plano.
 *
 * O sinal visual é sempre, sem configuração: estado no botão fechado (ícone, cor e nome
 * acessível) e pulso quando a pausa foi automática e ainda ninguém retomou.
 *
 * O som é **opcional e ligado por padrão**, por decisão do dono em 2026-10-09. Ele toca
 * sozinho, sem a pessoa pedir, e a política de autoplay só libera áudio depois de um gesto
 * — por isso o interruptor toca uma prévia ao ser ligado: se a pessoa não ouviu nada, o
 * navegador está bloqueando e ela desliga.
 *
 * A preferência é persistida pelo seam `lib/client-storage.ts`, chave `dq:som-pausa`, e o
 * valor padrão é `true`. A leitura acontece depois da montagem, como em
 * `session-welcome-balloon.tsx`, para não divergir entre servidor e cliente na hidratação.
 */
import { useCallback, useEffect, useState } from "react"
import { PauseCircle, Clock } from "lucide-react"

import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { InfoHint } from "@/components/ui/info-hint"
import { clientStorageKey, readJson, writeJson } from "@/lib/client-storage"
import { isAlertSoundSupported, playAlertSound } from "@/lib/notifications/alert-sound"

/** Chave da preferência de som. `dq:som-pausa` = true/false. */
export const PAUSE_SOUND_KEY = clientStorageKey("som-pausa")

export interface UseSessionAlertSound {
  /** Preferência vigente (após a leitura do navegador). */
  enabled: boolean
  /** Liga ou desliga; ao ligar, toca a prévia que destrava o áudio. */
  setEnabled: (value: boolean) => void
  /** Toca o som **se** a preferência estiver ligada. Cale quando desligado. */
  playPauseSound: () => boolean
  /** Este navegador consegue tocar som. `false` deixa o interruptor desabilitado. */
  supported: boolean
  /** `false` até a leitura do navegador acontecer (evita divergência na hidratação). */
  loaded: boolean
}

export function useSessionAlertSound(): UseSessionAlertSound {
  const [enabled, setEnabledState] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    setSupported(isAlertSoundSupported())
    // Ligado por padrão (dono, 2026-10-09). Quem nunca mexeu na chave ouve o som.
    setEnabledState(readJson<boolean>(PAUSE_SOUND_KEY, true) === true)
    setLoaded(true)
  }, [])

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value)
    writeJson(PAUSE_SOUND_KEY, value)
    if (value) {
      // O clique no interruptor é o gesto que a política de autoplay exige. Sem a prévia,
      // "ligado" seria uma promessa que o navegador pode não cumprir.
      playAlertSound("pause")
    }
  }, [])

  const playPauseSound = useCallback(() => {
    if (!enabled) return false
    return playAlertSound("pause")
  }, [enabled])

  return { enabled, setEnabled, playPauseSound, supported, loaded }
}

/** O interruptor, no painel do cronômetro. */
export function SessionAlertSoundToggle({
  enabled,
  onChange,
  supported,
  loaded,
}: {
  enabled: boolean
  onChange: (value: boolean) => void
  supported: boolean
  loaded: boolean
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Label htmlFor="session-alert-sound" className="text-xs font-medium text-muted-foreground">
            Som ao pausar
          </Label>
          {loaded && supported && (
            <InfoHint
              text="Um toque curto quando a sessão for pausada. Já vem ligado; desligue aqui se preferir silêncio."
              label="Como funciona o som ao pausar"
            />
          )}
        </div>
        <Switch
          id="session-alert-sound"
          data-testid="session-alert-sound"
          checked={loaded ? enabled : false}
          onCheckedChange={onChange}
          disabled={!supported}
          aria-label="Som ao pausar"
        />
      </div>
      {!loaded ? (
        <p className="text-[11px] text-muted-foreground">Lendo a preferência deste navegador…</p>
      ) : !supported ? (
        // Estado, não enfeite: este texto fica visível porque explica o interruptor desabilitado.
        <p className="text-[11px] text-muted-foreground">Este navegador não permite tocar som.</p>
      ) : null}
    </div>
  )
}

export type SessionTimerVisualState = "none" | "active" | "paused" | "auto-paused"

/**
 * O que o cronômetro fechado mostra. Antes desta onda, o botão era o mesmo ícone de relógio
 * em qualquer estado — inclusive sem sessão.
 */
export function SessionTimerIndicator({
  state,
}: {
  state: SessionTimerVisualState
}) {
  const paused = state === "paused" || state === "auto-paused"

  return (
    <span className="relative flex h-full w-full items-center justify-center">
      {paused ? (
        <PauseCircle className="h-5 w-5 text-amber-500" data-testid="session-timer-icon-paused" />
      ) : (
        <Clock className="h-5 w-5" data-testid="session-timer-icon-clock" />
      )}

      {state === "auto-paused" && (
        <span
          data-testid="session-timer-auto-pause-dot"
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 motion-safe:animate-pulse"
        />
      )}
    </span>
  )
}

/** Nome acessível do botão fechado: o estado da sessão é a informação que faltava. */
export function sessionTimerButtonLabel(state: SessionTimerVisualState): string {
  switch (state) {
    case "active":
      return "Sessão de trabalho ativa — abrir timer de sessão"
    case "paused":
      return "Sessão de trabalho pausada — abrir timer de sessão"
    case "auto-paused":
      return "Sessão de trabalho pausada automaticamente — abrir timer de sessão"
    default:
      return "Abrir timer de sessão"
  }
}