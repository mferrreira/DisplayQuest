"use client"

/**
 * BoardColumn (E2/T2.4) — coluna do quadro: faixa de título por token semântico (V6-3)
 * + contagem + estado vazio.
 *
 * plan-v3 OND3-A (AC-P3-06) — a coluna tem altura limitada e scroll próprio. Antes, a coluna
 * crescia com o conteúdo e o scroll era o da página inteira: medido na instância, uma coluna
 * com 17 cartões media 5.586 px e o documento 5.949 px numa janela de 900 px — as cinco colunas
 * ocupavam seis telas de rolagem para se ver o quadro inteiro, e as vazias esticavam até a
 * altura da mais cheia.
 *
 * A reserva de 17rem é medida, não chutada: cabeçalho 65 px + padding do main 24 px + h1 32 px
 * + margem do h1 24 px + barra do quadro 84 px + respiro 24 px = 257 px medidos a 1440 px de
 * largura; com a reserva, a coluna fecha em 885 px numa janela de 900 px. Em janela estreita
 * (390 px medidos) o cromo sobe para 371 px porque a barra do quadro quebra em mais linhas — aí
 * a página rola um pouco mais, o que não quebra nada: o que o batch promete é altura limitada e
 * scroll por coluna, não página sem rolagem em telefone.
 *
 * O `dvh` (e não `vh`) evita a altura extra da barra de endereço no telefone. O cabeçalho da
 * coluna fica fora da área de rolagem por construção: ele é irmão do `Droppable`, e quem rola é
 * só o `div` interno, com `min-h-0` para o flexbox poder encolhê-lo abaixo do conteúdo.
 *
 * plan-v3 OND3-C: o cabeçalho ganhou o controle de ordenação da própria coluna, do lado da
 * contagem e antes do "+". É um botão de ícone como o "+" que já existia (mesma caixa de 24 px,
 * mesmo contraste sobre a faixa colorida) e não um `<select>` nativo: o quadro já é 5 colunas de
 * 1180 px de largura mínima, e mais um campo de formulário em cada cabeçalho compete com o
 * cartão por atenção. O que está valendo fica no `title` do botão e no item marcado do menu —
 * quem abre o menu vê.
 *
 * O rótulo acessível é "Ordenar tarefas de <coluna>" e **não** "Ordenar coluna <coluna>": medido
 * no navegador (Playwright, 2026-10-03), a segunda forma contém a string da coluna
 * (`aria-label="Coluna A Fazer"`), e qualquer busca por rótulo que case por substring — `getByLabel`
 * é assim por padrão — passa a achar dois elementos: a coluna e o botão dela.
 *
 * O menu oferece só o que `COLUMN_ORDERS` lista e marca o vigente com item de rádio. A regra do
 * item é `onValueChange` guardado por `isColumnOrder`: o valor vem do DOM, e um item futuro sem
 * par em `COLUMN_ORDERS` não pode escrever lixo na preferência.
 */
import { Droppable } from "@hello-pangea/dnd"
import { AlertTriangle, ArrowUpDown, CheckCircle2, Clock, Eye, PenLine, Pencil, Plus, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Task, TaskStatus } from "@/entities/task"
import { isTaskOverdue, isTaskDueToday } from "../utils/move-rules"
import { COLUMN_ORDERS, columnOrderTitle, isColumnOrder, type ColumnOrder } from "../utils/column-order"
import { TaskCard } from "./task-card"

const COLUMN_STYLES: Record<TaskStatus, { header: string; icon: LucideIcon }> = {
  // V6-3 (RF-V6.4 R4, AC-V6-12): tinta chapada de token semantico no lugar do degradê
  // saturado, lucide no lugar do emoji. O contraste vem do proprio par `--*-foreground`
  // que o `.dark` redefine — nenhum `dark:` casado a mao, nenhuma paleta crua.
  "to-do": { header: "bg-muted text-muted-foreground", icon: Clock },
  "in-progress": { header: "bg-info/10 text-info", icon: Pencil },
  "in-review": { header: "bg-review/10 text-review", icon: Eye },
  adjust: { header: "bg-warning/10 text-warning", icon: AlertTriangle },
  done: { header: "bg-success/10 text-success", icon: CheckCircle2 },
}

const COLUMN_TITLES: Record<TaskStatus, string> = {
  "to-do": "A Fazer",
  "in-progress": "Fazendo",
  "in-review": "Em Revisão",
  adjust: "Ajustes",
  done: "Concluído",
}

export interface BoardColumnProps {
  status: TaskStatus
  tasks: Task[]
  canAddTask: boolean
  isCompact?: boolean
  /** Ordenação vigente desta coluna (vem do quadro, que guarda a preferência). */
  order: ColumnOrder
  /** Troca a ordenação desta coluna. */
  onOrderChange: (order: ColumnOrder) => void
  onAddTask: () => void
  onEdit: (task: Task) => void
  onOpenDetail: (task: Task) => void
}

export function BoardColumn({ status, tasks, canAddTask, isCompact, order, onOrderChange, onAddTask, onEdit, onOpenDetail }: BoardColumnProps) {
  const style = COLUMN_STYLES[status]
  const title = COLUMN_TITLES[status]

  return (
    <div className="flex max-h-[calc(100dvh-17rem)] min-h-[400px] flex-col overflow-hidden rounded-lg border bg-muted/30">
      <div className={`flex shrink-0 items-center justify-between border-b px-3 py-3 ${style.header}`}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <style.icon className="h-4 w-4" aria-hidden="true" />
          <h2 className="tracking-tight">{title}</h2>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-md border border-current/30 px-2 py-0.5 text-xs font-semibold">
            {tasks.length}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-current hover:bg-background/20"
                aria-label={`Ordenar tarefas de ${title}`}
                title={`Ordenar por ${columnOrderTitle(order)}`}
              >
                <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={order}
                onValueChange={(value) => {
                  if (isColumnOrder(value)) onOrderChange(value)
                }}
              >
                {COLUMN_ORDERS.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id}>
                    {option.title}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {canAddTask && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-current hover:bg-background/20"
              onClick={onAddTask}
              aria-label={`Adicionar tarefa em ${title}`}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <Droppable droppableId={status}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`min-h-0 flex-1 space-y-0 overflow-y-auto overscroll-contain p-3 ${snapshot.isDraggingOver ? "bg-accent/40" : ""}`}
            aria-label={`Coluna ${title}`}
          >
            {tasks.length === 0 ? (
              <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
                <PenLine className="h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Nenhuma tarefa</p>
                <p className="text-xs text-muted-foreground/70">Arraste uma tarefa aqui</p>
              </div>
            ) : (
              tasks.map((task, index) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  index={index}
                  isOverdue={isTaskOverdue(task)}
                  isDueToday={isTaskDueToday(task)}
                  isCompact={isCompact}
                  onEdit={onEdit}
                  onOpenDetail={onOpenDetail}
                />
              ))
            )}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
