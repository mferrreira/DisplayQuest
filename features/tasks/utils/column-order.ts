/**
 * plan-v3 OND3-C (AC-P3-07) — as ordenações que cada coluna do quadro pode usar, e a chave
 * com que a escolha fica guardada.
 *
 * Duas medições na instância antes de escolher as opções (2026-10-03, `GET /api/tasks` com 27
 * tarefas do coordenador):
 *
 * 1. **A tarefa na volta sem `createdAt`** — são 17 campos e nenhum deles é data de criação. Por
 *    isso "Mais recentes" ordena por `id` decrescente, que é o `orderBy id desc` do repositório e
 *    exatamente o desempate que `sortTasksByUrgencyAndDueDate` já usava. Não existe "criado
 *    em" para ordenar.
 * 2. **`tasks.points` é heterogêneo na mesma lista**: 10, 15, 20, 25, 40 e 60. São restos de
 *    antes das 10 pts fixas (DEC-30), e DEC-40 congelou a coluna como histórico. Então "Pontos"
 *    ordena pelo **valor gravado na tarefa** — determinístico e sem relógio — e não pela
 *    premiação atual (10 + bônus/pentalidade de prazo), que muda todo dia e não é o número que
 *    o rótulo "Pontos" nomeia.
 *
 * `urgencia` **não** é reimplementado aqui: delega ao comparador que já ordenava o quadro, para
 * que o padrão não possa divergir por acidente de uma cópia.
 *
 * Puro: só tipos, uma função de chave (string) e ordenação. Nenhuma função toca `window`, o que
 * deixa o arquivo testável sem jsdom e importável no servidor.
 */
import { clientStorageKey } from "@/lib/client-storage"
import type { Task, TaskStatus } from "@/entities/task"
import { sortTasksByUrgencyAndDueDate, TASK_STATUSES } from "./move-rules"

/** Identificadores das ordenações. Texto é para o storage; o que a pessoa lê é `COLUMN_ORDERS`. */
export type ColumnOrder = "urgencia" | "prazo" | "recentes" | "pontos" | "alfabetica";

/** As opções do menu, na ordem em que aparecem. Um lugar só para id e rótulo. */
export const COLUMN_ORDERS: ReadonlyArray<{ id: ColumnOrder; title: string }> = [
  { id: "urgencia", title: "Urgência" },
  { id: "prazo", title: "Prazo" },
  { id: "recentes", title: "Mais recentes" },
  { id: "pontos", title: "Pontos" },
  { id: "alfabetica", title: "Alfabética" },
];

/** O que o quadro fazia antes deste batch — e o que uma coluna volta a fazer sem preferência. */
export const DEFAULT_COLUMN_ORDER: ColumnOrder = "urgencia";

/**
 * Guarda de leitura. O storage é texto que outra versão do app pode ter escrito: `readJson`
 * devolve o padrão quando o JSON está quebrado, mas um JSON válido que não seja uma ordem
 * (`"prazo "` com espaço, `42`, um objeto de outra versão) precisa cair no padrão em vez de
 * virar um item de menu sem par.
 */
export function isColumnOrder(value: unknown): value is ColumnOrder {
  return COLUMN_ORDERS.some((option) => option.id === value);
}

/** Rótulo da ordem — usado em rótulos acessíveis e no tooltip do botão. */
export function columnOrderTitle(order: ColumnOrder): string {
  return COLUMN_ORDERS.find((option) => option.id === order)?.title ?? "Urgência";
}

/**
 * Chave da preferência: por **coluna** e por **pessoa** (DEC-33). O navegador já é a parte "por
 * navegador" do requisito — `localStorage` é do navegador.
 *
 * A pessoa entra antes da coluna, como `clientStorageKey` documenta desde a Onda 2.A:
 * `dq:column-order:42:to-do`. Sem id — antes de `useSession` resolver — a chave fica
 * `dq:column-order:to-do`, ou seja, a preferência do quadro anônimo; ela some quando a sessão
 * resolve, porque a leitura refaz com o id.
 */
export function columnOrderStorageKey(
  userId: number | null | undefined,
  status: TaskStatus,
): string {
  return clientStorageKey("column-order", userId, status);
}

/** Mapa status → ordem, todo mundo no padrão. Um objeto novo a cada chamada (estado do React). */
export function defaultColumnOrders(): Record<TaskStatus, ColumnOrder> {
  const orders = {} as Record<TaskStatus, ColumnOrder>;
  for (const status of TASK_STATUSES) orders[status] = DEFAULT_COLUMN_ORDER;
  return orders;
}

/** O que a ordenação precisa saber da tarefa — e nada mais. */
type OrderableTask = Pick<Task, "id" | "title" | "priority" | "dueDate" | "points">;

/**
 * Desempate comum a todas as ordenações: mais novo primeiro (`id` decrescente), que é a ordem
 * que o repositório entrega. Sem ele, duas tarefas iguais na ordenação trocam de lugar entre
 * renders e entre pessoas — o card "pula" quando os dados chegam.
 */
const newestFirst = (a: OrderableTask, b: OrderableTask): number => b.id - a.id;

/**
 * Prazo: mais cedo primeiro; **sem prazo no fim**, porque tarefa sem prazo não tem prazo para
 * comparar — colocá-la antes esconderia o que está vencendo. `dueDate` é texto `YYYY-MM-DD`
 * (medido no `GET /api/tasks` e documentado em `entities/task.ts`), então comparar como texto
 * ordena por data, inclusive quando o valor traz hora.
 */
function byDueDate(a: OrderableTask, b: OrderableTask): number {
  if (a.dueDate != null && b.dueDate != null) {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return 0;
  }
  if (a.dueDate != null) return -1;
  if (b.dueDate != null) return 1;
  return 0;
}

/**
 * Ordena a lista da coluna. Cópia antes de ordenar: a lista recebida é a mesma que a origem dos
 * dados guarda, e `sort` no lugar mexeria no cache do React Query.
 */
export function sortTasksByColumnOrder<T extends OrderableTask>(
  tasks: T[],
  order: ColumnOrder,
): T[] {
  switch (order) {
    case "urgencia":
      return sortTasksByUrgencyAndDueDate(tasks);
    case "prazo":
      return [...tasks].sort((a, b) => byDueDate(a, b) || newestFirst(a, b));
    case "recentes":
      return [...tasks].sort(newestFirst);
    case "pontos":
      return [...tasks].sort((a, b) => b.points - a.points || newestFirst(a, b));
    case "alfabetica":
      return [...tasks].sort((a, b) => a.title.localeCompare(b.title, "pt-BR") || newestFirst(a, b));
  }
}
