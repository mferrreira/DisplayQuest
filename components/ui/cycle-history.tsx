"use client"

import { Crown, Sparkles } from "lucide-react"

import type { UserCycleHistory } from "@/contexts/types"
import {
  ELO_LABELS,
  SEASON_CHAMPION_POSITION,
  civilMonthLabel,
  isEloTier,
} from "@/backend/domain"

/**
 * CycleHistory — plan-v8 V8-7 (DEC-220). Os dois livros da pessoa: os MESES fechados (`month_history`,
 * DEC-212) e as TEMPORADAS fechadas (`season_history`, DEC-213).
 *
 * Componente de leitura pura: quem busca é a tela (o perfil), e o que ele mostra é o registro escrito
 * pelo fechamento. Nenhum número é reconstituído aqui — depois da zeragem de `points`/`xp`, o único
 * lugar onde o ano fechado existe é a linha do livro, e uma tela que refizesse a conta sobre o saldo de
 * hoje diria "zero" sobre um ano que teve campeão.
 *
 * O elo pode ser um token que a escada de hoje não conhece (a escada é código e o livro é registro):
 * nesse caso a coluna sai em traço em vez de um rótulo inventado.
 *
 * As listas têm teto de altura (`max-h` + `overflow-y-auto`) com o contêiner `relative`: o histórico de
 * uma pessoa cresce para dentro do quadro, nunca para fora da página (a lição do `sr-only` que esticou o
 * painel no V6-11h).
 */
export function CycleHistory({
  history,
  className = "",
}: {
  history: UserCycleHistory | null
  className?: string
}) {
  if (!history) return null

  const months = history.months
  const seasons = history.seasons

  return (
    <div className={`space-y-6 ${className}`}>
      <section aria-labelledby="cycle-history-months" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cycle-history-months" className="text-sm font-semibold">
            Meses fechados
          </h2>
          <p className="text-xs text-muted-foreground">O placar do mês é fotografado antes de zerar.</p>
        </div>
        {months.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum mês fechado ainda.</p>
        ) : (
          <div className="relative max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Mês</th>
                  <th className="py-2 text-right font-medium">Pontos</th>
                  <th className="py-2 text-right font-medium">Tarefas</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.month} className="border-b border-border/60">
                    <td className="py-2">{civilMonthLabel(month.month)}</td>
                    <td className="py-2 text-right font-bold tabular-nums">{month.points}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{month.completedTasks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="cycle-history-seasons" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="cycle-history-seasons" className="text-sm font-semibold">
            Temporadas fechadas
          </h2>
          <p className="text-xs text-muted-foreground">
            Posição e elo do ano, como ficaram no fechamento.
          </p>
        </div>
        {seasons.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma temporada fechada ainda.</p>
        ) : (
          <div className="relative max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Temporada</th>
                  <th className="py-2 text-right font-medium">Posição</th>
                  <th className="py-2 text-right font-medium">Pontos</th>
                  <th className="py-2 text-right font-medium">Tarefas</th>
                  <th className="py-2 text-right font-medium">
                    <Sparkles className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    XP
                  </th>
                  <th className="py-2 font-medium">Elo</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((season) => {
                  const champion = season.position === SEASON_CHAMPION_POSITION
                  return (
                    <tr
                      key={season.year}
                      className={`border-b border-border/60 ${champion ? "bg-warning/5" : ""}`}
                      data-testid={champion ? `season-champion-${season.year}` : undefined}
                    >
                      <td className="py-2">
                        {champion ? (
                          <span className="flex items-center gap-1.5 font-medium text-warning">
                            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
                            {season.year}
                          </span>
                        ) : (
                          season.year
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums">{season.position ?? "—"}</td>
                      <td className="py-2 text-right font-bold tabular-nums">{season.points}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{season.completedTasks}</td>
                      <td className="py-2 text-right tabular-nums text-muted-foreground">{season.xp}</td>
                      <td className="py-2 text-muted-foreground">
                        {season.elo && isEloTier(season.elo) ? ELO_LABELS[season.elo] : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
