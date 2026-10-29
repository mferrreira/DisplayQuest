"use client"

/**
 * ProfileMonthsList — plan-v9 S04 (MODELO §7, DEC-232).
 *
 * Os meses fechados de UMA pessoa, na forma mínima da plastica do perfil: rótulo quieto +
 * posição e valor. O MESMO componente serve ao perfil próprio e ao perfil de outra pessoa
 * (UserProfileView): quem abre perfil de terceiro vê a lista no lugar que o perfil próprio
 * mostra o histórico — decisão do dono na S04, não cópia de código em dois lugares.
 *
 * A tela não inventa estados: lista vazia é o `notice` que o servidor manda, com EmptyState
 * nomeando o que falta. Erro de rede é estado nomeado, não lista em silêncio.
 */
import { useEffect, useState } from "react"
import { GitCommitHorizontal, Trophy } from "lucide-react"

import { fetchAPI } from "@/contexts/api-client"
import { EmptyState } from "@/components/ui/empty-state"

interface ProfileMonthsRead {
  userId: number
  months: Array<{
    month: string
    monthLabel: string
    value: number
    position: number
  }>
  notice: string
}

export function ProfileMonthsList({ userId }: { userId: number }) {
  const [state, setState] = useState<{
    loading: boolean
    failed: boolean
    data: ProfileMonthsRead | null
  }>({ loading: true, failed: false, data: null })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, failed: false, data: null })

    fetchAPI<ProfileMonthsRead>(`/api/users/${userId}/board-months`)
      .then((read) => {
        if (!cancelled && read.userId === userId) setState({ loading: false, failed: false, data: read })
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, failed: true, data: null })
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  if (state.loading) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Lendo os meses fechados...
      </p>
    )
  }

  if (state.failed || !state.data) {
    return (
      <EmptyState
        icon={Trophy}
        title="Meses indisponíveis"
        description="Não foi possível ler os meses fechados. Tente de novo mais tarde."
        className="rounded-lg border border-dashed border-border"
      />
    )
  }

  const { months, notice } = state.data

  if (months.length === 0) {
    return (
      <EmptyState
        icon={Trophy}
        title="Nenhum mês fechado"
        description={notice}
        className="rounded-lg border border-dashed border-border"
      />
    )
  }

  // O rótulo é "Histórico de meses" e NÃO repete "Meses fechados" (título da seção em volta):
  // o mesmo accessible-name em dois elementos da página é o modo de falha 3.C da casa — em
  // Testing Library o match de string é exato e em Playwright/regex os dois achados viram
  // strict mode violation. O nome do dl precisa poder coexistir com o da seção.
  return (
    <dl aria-label="Histórico de meses" className="space-y-4">
      {months.map((entry) => (
        <div key={entry.month} className="flex items-baseline justify-between gap-6 border-t border-border pt-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {entry.monthLabel}
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums leading-none">
              {entry.position}º
            </dd>
          </div>
          <dd
            className="flex items-center gap-1.5 text-lg font-bold tabular-nums"
            aria-label={`${entry.monthLabel}: ${entry.value} pontos na posição ${entry.position}`}
          >
            <GitCommitHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
