"use client"

/**
 * plan-v3 OND2-B — rascunho de anotações da sessão de trabalho.
 *
 * O problema medido: o texto da sessão só existia na caixa "Finalizar Work Session", criada
 * no clique em **Parar**. Quem anotava o que fez durante as horas de trabalho tinha duas
 * opções ruins — não anotar nada, ou anotar fora do sistema e digitar tudo de novo no fim
 * (e perder o texto se a página recarregasse ou o encerramento falhasse).
 *
 * Regras deste rascunho (as mesmas do PLAN.md § Onda 2):
 *  - o texto é salvo **por sessão**: a chave inclui o id, então trocar de sessão não herda a
 *    anotação da anterior;
 *  - a gravação é **debounced** (400 ms), porque escrever a cada tecla é o que faz o
 *    `localStorage` virar gargalo em máquina de laboratório;
 *  - o rascunho **nunca é apagado sozinho**: só `clearNote()` apaga, e quem chama é o
 *    encerramento bem-sucedido (ver `floating-session-timer.tsx`). Falha ao encerrar deixa o
 *    texto onde estava;
 *  - ao abrir **Finalizar Work Session**, o rascunho é despejado na caixa de log, que segue
 *    editável (o dono decide o texto final);
 *  - o rascunho sobrevive a recarga e a fechar o painel: o que estava pendente de debounce
 *    é gravado no unmount.
 *
 * Persistência pelo seam da Onda 2.A (`lib/client-storage.ts`): sem storage disponível
 * (SSR, storage bloqueado) o componente continua funcionando, só não lembra.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { clientStorageKey, readText, removeItem, writeText } from "@/lib/client-storage"

/** Espera antes de gravar. Curto o bastante para não perder trabalho, longo o bastante para não travar a digitação. */
export const SESSION_NOTES_DEBOUNCE_MS = 400

/** Chave por sessão: `dq:session-notes:<id>`. */
export function sessionNotesKey(sessionId: number): string {
  return clientStorageKey("session-notes", sessionId)
}

export interface UseSessionNotes {
  /** Texto do rascunho da sessão atual (string vazia quando não há sessão ou não há rascunho). */
  note: string
  setNote: (value: string) => void
  /** Apaga o rascunho da sessão atual. Só chamar quando o encerramento deu certo. */
  clearNote: () => void
  /** Há texto aproveitável no rascunho? */
  hasNote: boolean
}

/**
 * Estado do rascunho, preso a uma sessão. Trocar de `sessionId` recarrega o texto daquele
 * id — nunca o da sessão anterior.
 */
export function useSessionNotes(sessionId: number | null): UseSessionNotes {
  const [note, setNote] = useState("")
  const [loadedFor, setLoadedFor] = useState<number | null>(null)
  // O que está esperando o debounce. Vive fora do estado para o cleanup de unmount poder
  // gravar sem re-renderizar.
  const pendingRef = useRef<{ sessionId: number; note: string } | null>(null)
  // Último id visto, para que `clearNote` ainda apague a chave certa se a sessão já tiver
  // sumido do contexto quando o encerramento for confirmado (corrida com o poll de 30s).
  const lastSessionIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (sessionId === null) {
      pendingRef.current = null
      setNote("")
      setLoadedFor(null)
      return
    }
    lastSessionIdRef.current = sessionId
    setNote(readText(sessionNotesKey(sessionId)) ?? "")
    setLoadedFor(sessionId)
  }, [sessionId])

  // Grava com debounce; texto vazio remove a chave em vez de gravar string vazia.
  useEffect(() => {
    if (sessionId === null || loadedFor !== sessionId) return
    pendingRef.current = { sessionId, note }
    const timer = setTimeout(() => {
      pendingRef.current = null
      if (note.trim() === "") removeItem(sessionNotesKey(sessionId))
      else writeText(sessionNotesKey(sessionId), note)
    }, SESSION_NOTES_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [note, sessionId, loadedFor])

  // Fechar o painel ou navegar não pode custar o que ainda estava no debounce.
  useEffect(() => {
    return () => {
      const pending = pendingRef.current
      if (!pending) return
      pendingRef.current = null
      writeText(sessionNotesKey(pending.sessionId), pending.note)
    }
  }, [])

  const clearNote = useCallback(() => {
    pendingRef.current = null
    const target = sessionId ?? lastSessionIdRef.current
    if (target !== null) removeItem(sessionNotesKey(target))
    setNote("")
  }, [sessionId])

  return { note, setNote, clearNote, hasNote: note.trim() !== "" }
}

export interface SessionNotesDraftProps {
  sessionId: number | null
  note: string
  onNoteChange: (value: string) => void
}

/**
 * A caixa de anotações dentro do cronômetro. É controlled: quem guarda o texto é o
 * `floating-session-timer`, porque é ele quem precisa despejar o rascunho no log no momento
 * de encerrar.
 */
export function SessionNotesDraft({ sessionId, note, onNoteChange }: SessionNotesDraftProps) {
  if (sessionId === null) return null

  return (
    <div className="space-y-1">
      <label htmlFor="session-notes-draft" className="text-xs font-medium text-muted-foreground">
        Anotações da sessão
      </label>
      <Textarea
        id="session-notes-draft"
        data-testid="session-notes-draft"
        rows={3}
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="O que você está fazendo nesta sessão…"
        aria-describedby="session-notes-draft-hint"
      />
      <p id="session-notes-draft-hint" className="text-[11px] text-muted-foreground">
        Salvo neste navegador enquanto a sessão estiver aberta. Ao parar, o texto vem para a
        caixa de log, onde dá para editar antes de encerrar.
      </p>
    </div>
  )
}