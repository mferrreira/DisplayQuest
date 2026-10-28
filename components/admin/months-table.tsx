"use client"

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"

import { compareByBoardPosition } from "@/backend/domain"
import { fetchAPI } from "@/contexts/api-client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * S05 (MODELO §7; ADR-005/ADR-006/DEC-228) — a tabela de meses da aba Meses do painel.
 *
 * Dois quadros, o MESMO formato de linha (nome, valor, posição):
 *   - mês em curso: montado client-side sobre a lista que o painel já tem, na MESMA régua do
 *     quadro vivo (compareByBoardPosition — ADR-005). Nenhuma leitura de histórico: o vivo não
 *     é histórico, e chamá-lo responderia quadro velho no instante do ajuste.
 *   - mês fechado: linhas de /api/board?month= (CA4), na posição GRAVADA, com o aviso do
 *     SERVIDOR — a tela imprime, não redige estado de fechamento.
 *
 * O seletor só offre meses que o catálogo do servidor declara (R9): mês nunca é deduzido aqui.
 * O ajuste (DEC-228) fala PATCH /api/users/:id/month-points e o de/para que a TELA anuncia é o
 * da RESPOSTA (R7: o servidor é a única fonte). Cada falha vira alert — a promessa rejeitada
 * não escapa do onClick (DEC-85).
 */

/** Sentinela do Select: "sem valor" não pode ser string vazia no Radix. */
const NO_PERSON = "none"

export interface MonthsTableRowUser {
  id: number
  name: string
  currentMonthPoints: number
  status?: string
}

interface ClosedMonthOption {
  month: string
  monthLabel: string
}

interface MonthRow {
  userId: number
  name: string
  value: number
  position: number
}

interface CatalogReady {
  status: "ready"
  month: string
  monthLabel: string
  closedMonths: ClosedMonthOption[]
}

type CatalogState = { status: "loading" } | { status: "failed" } | CatalogReady

interface ClosedBoardReady {
  status: "ready"
  month: string
  monthLabel: string
  entries: MonthRow[]
  notice: string | null
}

type ClosedBoardState =
  | null
  | { status: "loading"; month: string }
  | { status: "failed"; month: string }
  | ClosedBoardReady

interface AdjustNoticeState {
  tone: "ok" | "error"
  text: string
}

export interface MonthsTableProps {
  /** A lista de pessoas do contexto — o mesmo feed do quadro vivo (perfil/quadro procuram nela). */
  rows: MonthsTableRowUser[]
  /** Sem a chave de gestão o ajuste não existe; a tabela continua (o gate real é do servidor). */
  canAdjust?: boolean
  /**
   * Uma mudança aqui re-ler o catálogo de meses: o dono do botão "Fechar mês" sobe este número
   * — é a dobradiça que põe o mês recém-fechado no seletor (o painel é quem compõe os dois).
   */
  refreshKey?: number
}

type MonthsCatalogResponse = {
  month: string
  monthLabel: string
  closedMonths: ClosedMonthOption[]
}

type MonthsHistoryResponse = {
  month: string
  monthLabel: string
  entries: MonthRow[]
  notice?: string
}

type MonthPointsResponse = {
  userId: number
  monthLabel: string
  previous: number
  current: number
}

export function MonthsTable({ rows, canAdjust = false, refreshKey = 0 }: MonthsTableProps) {
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" })
  // null = o mês em curso (nunca um mês conveyor pela resposta do histórico).
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [closedBoard, setClosedBoard] = useState<ClosedBoardState>(null)
  const [personId, setPersonId] = useState<string | null>(null)
  const [adjustAction, setAdjustAction] = useState<"set" | "add" | "remove">("set")
  const [adjustValue, setAdjustValue] = useState("0")
  const [adjustBusy, setAdjustBusy] = useState(false)
  const [adjustNotice, setAdjustNotice] = useState<AdjustNoticeState | null>(null)
  // plan-v9 S05: o valor ajustado não volta da lista do contexto (a lista recarrega no refresh
  // do painel inteiro). O de/para que a RESPOSTA trouxe manda na linha enquanto a sessão vive.
  const [overrides, setOverrides] = useState<Record<number, number>>({})

  useEffect(() => {
    let cancelled = false
    setCatalog({ status: "loading" })
    fetchAPI<MonthsCatalogResponse>("/api/board")
      .then((data) => {
        if (!cancelled) {
          setCatalog({
            status: "ready",
            month: data.month,
            monthLabel: data.monthLabel,
            closedMonths: Array.isArray(data.closedMonths) ? data.closedMonths : [],
          })
        }
      })
      .catch(() => {
        if (!cancelled) setCatalog({ status: "failed" })
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  // Mês corrente visto pela régua do quadro vivo — ADR-005: MESMA régua do fechado (valor desc,
  // depois nome, depois id). O gancho da régua é do domínio, não uma segunda cópia (DEC-227).
  const liveRows: MonthRow[] = [...rows]
    .sort(
      (left, right) =>
        compareByBoardPosition(
          { id: left.id, name: left.name, currentMonthPoints: left.currentMonthPoints ?? 0 },
          { id: right.id, name: right.name, currentMonthPoints: right.currentMonthPoints ?? 0 },
        ),
    )
    .map((person, index) => ({
      userId: person.id,
      name: person.name,
      value: overrides[person.id] ?? person.currentMonthPoints ?? 0,
      position: index + 1,
    }))

  const viewingCurrent = catalog.status === "ready" && (selectedMonth === null || selectedMonth === catalog.month)

  // O rótulo do cabeçalho descreve o mês VISTO, não o corrente: escolher junho de 2027 no
  // seletor e continuar lendo "outubro" era a mentira que a sonda do Select mediu. Nos estados
  // de loading/failed (sem catálogo), o rótulo é vazio — a tela inteira é trocada por status.
  const viewedMonth =
    catalog.status !== "ready"
      ? ""
      : viewingCurrent
        ? catalog.monthLabel
        : catalog.closedMonths.find((month) => month.month === selectedMonth)?.monthLabel ?? ""

  useEffect(() => {
    // Só há histórico a ler quando o mês escolhido NÃO é o corrente: o vivo é montado da lista
    // (nenhuma leitura de histórico no caminho do ajuste) e o corrente requested pelo nome
    // responderia "vivo" de qualquer jeito (R9).
    if (catalog.status !== "ready" || viewingCurrent || !selectedMonth) {
      setClosedBoard(null)
      return
    }
    let cancelled = false
    setClosedBoard({ status: "loading", month: selectedMonth })
    fetchAPI<MonthsHistoryResponse>(`/api/board?month=${selectedMonth}`)
      .then((data) => {
        if (cancelled) return
        setClosedBoard({
          status: "ready",
          month: data.month,
          monthLabel: data.monthLabel,
          entries: Array.isArray(data.entries) ? data.entries : [],
          notice: data.notice ?? null,
        })
      })
      .catch(() => {
        if (!cancelled) setClosedBoard({ status: "failed", month: selectedMonth })
      })
    return () => {
      cancelled = true
    }
  }, [catalog, selectedMonth, viewingCurrent])

  if (catalog.status === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Lendo os meses do placar...
      </p>
    )
  }

  if (catalog.status === "failed") {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível ler os meses do placar. Tente o refresh do painel.
      </p>
    )
  }

  const currentLabel = catalog.monthLabel
  const closedBoardForSelection = closedBoard?.status === "ready" && closedBoard.month === selectedMonth
  const shownMonth = viewingCurrent
    ? liveRows
    : closedBoardForSelection
      ? closedBoard.entries
      : null

  // Destinatário do ajuste: por padrão, a primeira pessoa da régua. O Select usa sentinela
  // NO_PERSON (string vazia não existe no Radix — lição do V5-4a). CUIDADO com o nome do campo:
  // as linhas da régua têm `userId`, não `id` — o fallback lê o campo certa ou ninguém é o padrão.
  const selectedPersonId = personId ?? (liveRows[0] ? String(liveRows[0].userId) : NO_PERSON)
  const selectedPersonName = liveRows.find((person) => String(person.userId) === selectedPersonId)?.name

  const submitAdjust = async () => {
    if (!selectedPersonId || selectedPersonId === NO_PERSON || adjustBusy) {
      return
    }
    // O valor é lido do que está na caixa (o servidor aplica a régua DEC-60/DEC-84: ação antes
    // do número). A caixa vazia não dispara nada.
    if (adjustValue.trim() === "") {
      setAdjustNotice({ tone: "error", text: "Informe o valor do ajuste." })
      return
    }
    setAdjustBusy(true)
    try {
      const result = await fetchAPI<MonthPointsResponse>(`/api/users/${selectedPersonId}/month-points`, {
        method: "PATCH",
        body: JSON.stringify({ action: adjustAction, points: Number(adjustValue) }),
      })
      setOverrides((previous) => ({ ...previous, [result.userId]: result.current }))
      setAdjustNotice({
        tone: "ok",
        text: `Placar de ${selectedPersonName ?? `pessoa ${result.userId}`} ajustado: de ${result.previous} para ${result.current}.`,
      })
    } catch (error) {
      setAdjustNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Não foi possível ajustar o placar do mês.",
      })
    } finally {
      setAdjustBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm font-medium">Mês de {viewedMonth}</p>
        <Select
          value={selectedMonth ?? catalog.month}
          onValueChange={(value) => setSelectedMonth(value)}
        >
          {/* R9: o mês em curso é opção declarada, não escolha fantasma do lado do cliente.
              O gatilho não truncia: o sufixo "(em curso)" é a informação de estado — cortar em
              w-56 deixava a abertura indistinguível de um mês fechado (revisão S05). */}
          <SelectTrigger className="w-full max-w-full sm:w-auto" aria-label="Escolher mês">
            <SelectValue placeholder="Mês" />
          </SelectTrigger>
          <SelectContent>
            {/* R9: o mês em curso é opção declarada, não escolha fantasma do lado do cliente. */}
            <SelectItem value={catalog.month}>{currentLabel} (em curso)</SelectItem>
            {catalog.closedMonths.map((month) => (
              <SelectItem key={month.month} value={month.month}>
                {month.monthLabel}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {viewingCurrent ? (
        <p className="text-sm text-muted-foreground">
          Placar de {currentLabel} em curso. O quadro ainda está aberto.
        </p>
      ) : closedBoard && closedBoard.status === "loading" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Lendo o quadro do mês...
        </p>
      ) : closedBoard && closedBoard.status === "failed" ? (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível ler o quadro do mês. Tente o refresh do painel.
        </p>
      ) : closedBoardForSelection && closedBoard.notice ? (
        <p className="text-sm text-muted-foreground">
          {closedBoard.notice}
        </p>
      ) : null}

      {shownMonth && (
        <Table aria-label="Placar por pessoa no mês">
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Placar do mês</TableHead>
              <TableHead>Posição</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shownMonth.map((row) => (
              <TableRow key={`${row.name}-${row.userId}`}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="tabular-nums">{row.value}</TableCell>
                <TableCell className="tabular-nums">{row.position}º</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canAdjust && viewingCurrent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ajustar placar do mês
            </CardTitle>
            {/* DEC-228: o mês fechado é imutável e nenhuma caixa aqui alcança mês fechado — o
                controle só mora na visão do mês em curso. Cada ajuste vira linha de auditoria
                (quem, quando, para quem, de→para) escrita pelo servidor. */}
            <CardDescription>
              O ajuste vale só para o mês em curso e fica registrado na auditoria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Os quatro controles moram em UMA linha no desktop (revisão S05: a pilha em dois
                grupos fazia o olho casar "Colaborador + 0" — pares errados pelo chão); no
                mobile a pilha na mesma ordem é a que já foi capturada e não muda. */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Select value={selectedPersonId} onValueChange={setPersonId}>
                <SelectTrigger className="w-full sm:w-56" aria-label="Ajustar pessoa">
                  <SelectValue placeholder="Pessoa" />
                </SelectTrigger>
                <SelectContent>
                  {liveRows.map((row) => (
                    <SelectItem key={row.userId} value={String(row.userId)}>
                      {row.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={adjustAction} onValueChange={(value) => setAdjustAction(value as "set" | "add" | "remove")}>
                <SelectTrigger className="w-full sm:w-40" aria-label="Ação do ajuste">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="set">Definir</SelectItem>
                  <SelectItem value="add">Somar</SelectItem>
                  <SelectItem value="remove">Remover</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                value={adjustValue}
                onChange={(event) => setAdjustValue(event.target.value)}
                className="w-full sm:w-32"
                aria-label="Valor do ajuste"
                min={adjustAction === "set" ? undefined : 0}
                disabled={adjustBusy}
              />
              <Button onClick={() => void submitAdjust()} disabled={adjustBusy} className="w-full sm:w-auto">
                Ajustar
              </Button>
            </div>
            {adjustNotice && (
              <p
                role={adjustNotice.tone === "error" ? "alert" : "status"}
                className={
                  adjustNotice.tone === "error" ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-muted-foreground"
                }
              >
                {adjustNotice.text}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
