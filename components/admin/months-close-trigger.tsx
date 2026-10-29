"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { fetchAPI } from "@/contexts/api-client"

/**
 * S05 (MODELO §7; CA9) — o botão "Fechar mês" da aba Meses.
 *
 * O fechamento de verdade é a rota que a S02 entregou (POST /api/board/close) e o gate
 * MANAGE_USERS mora no use case (CloseBoardMonthUseCase): sem autoridade A ROTA recusa, e este
 * componente simplesmente não renderiza (MODELO: "o botão Fechar mês para a gestão"). O botão
 * é o disparo do administrador para o caso da rotina das 00:00 do dia 1 não ter rodado.
 *
 * Sem diálogo de confirmação: o fechamento é idempotente (R6 — a segunda corrida responde
 * alreadyClosed e nada muda) e a resposta é anunciada no lugar de um modal. A frase de
 * resultado vem do RESULTADO, nunca do desejo. Falha vira alert — a promessa rejeitada não
 * escapa do onClick (DEC-85).
 */

interface MonthsCloseResult {
  monthLabel: string
  peopleCount: number
  alreadyClosed: boolean
  /* O servidor carrega `closed: boolean` no mesmo corpo; nada aqui o lê — alreadyClosed já
   * decide a mensagem e o onClosed. Anotado na nota da fatia (revisão S05). */
}

export interface MonthsCloseTriggerProps {
  /** A chave de gestão do painel — falsa, o botão não existe (o servidor recusaria do mesmo jeito). */
  canManage: boolean
  /**
   * Chamado UMA vez quando ESTE clique fechou um mês de verdade — o dono da lista de meses
   * recarrega o catálogo para o seletor oferecer o mês novo. alreadyClosed não chama: nenhum
   * mês novo existe.
   */
  onClosed?: (result: MonthsCloseResult) => void
}

export function MonthsCloseTrigger({ canManage, onClosed }: MonthsCloseTriggerProps) {
  const [busy, setBusy] = useState(false)
  const [okMessage, setOkMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!canManage) {
    return null
  }

  const handleClose = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    setOkMessage(null)
    setErrorMessage(null)
    try {
      const result = await fetchAPI<MonthsCloseResult>("/api/board/close", { method: "POST" })
      if (result.alreadyClosed) {
        setOkMessage(`O mês de ${result.monthLabel} já estava fechado.`)
      } else {
        setOkMessage(`Fechamento de ${result.monthLabel} gravado: ${result.peopleCount} pessoas no histórico.`)
        onClosed?.(result)
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível fechar o mês do placar.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={() => void handleClose()} disabled={busy}>
        Fechar mês
      </Button>
      {okMessage && (
        <p role="status" className="text-sm text-muted-foreground">
          {okMessage}
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
