/**
 * plan-v3 OND3-C — as ordenações por coluna do quadro.
 *
 * As entradas dos casos usam valores **medidos na instância** (`GET /api/tasks` em 2026-10-03,
 * 27 tarefas do coordenador): `points` aparecendo como 10, 15, 20, 25, 40 e 60 na mesma lista e
 * nenhum `createdAt` no retorno — daí "Pontos" ordenar pelo valor gravado e "Mais recentes" pelo
 * `id` decrescente (que é o `orderBy id desc` do repositório).
 *
 * O caso que mais importa não é o de cada ordenação, é o de `urgencia`: ela precisa produzir
 * exatamente a ordem que o quadro já produzia, senão o padrão muda junto com o batch.
 */
import { describe, expect, it } from "vitest";
import {
  COLUMN_ORDERS,
  DEFAULT_COLUMN_ORDER,
  columnOrderStorageKey,
  columnOrderTitle,
  defaultColumnOrders,
  isColumnOrder,
  sortTasksByColumnOrder,
  type ColumnOrder,
} from "../utils/column-order";
import { sortTasksByUrgencyAndDueDate, TASK_STATUSES } from "../utils/move-rules";
import type { Task } from "@/entities/task";

type Orderable = Pick<Task, "id" | "title" | "priority" | "dueDate" | "points">;

function task(over: Partial<Orderable> = {}): Orderable {
  return { id: 0, title: "Tarefa", priority: "medium", dueDate: null, points: 10, ...over };
}

const ids = (list: Orderable[]) => list.map((t) => t.id);

describe("ordenação por coluna (plan-v3 OND3-C)", () => {
  it("urgência produz exatamente a ordem que o quadro já usava", () => {
    const lista = [
      task({ id: 1, priority: "low", dueDate: "2026-10-01" }),
      task({ id: 2, priority: "urgent", dueDate: null }),
      task({ id: 3, priority: "high", dueDate: "2026-10-09" }),
      task({ id: 4, priority: "high", dueDate: "2026-10-09" }),
      task({ id: 5, priority: "medium", dueDate: null }),
    ];
    expect(ids(sortTasksByColumnOrder(lista, "urgencia"))).toEqual(ids(sortTasksByUrgencyAndDueDate(lista)));
    // e toda coluna nasce nela: o padrão é o comportamento antigo, não uma escolha nossa
    expect(DEFAULT_COLUMN_ORDER).toBe("urgencia");
    expect(defaultColumnOrders()).toEqual({
      "to-do": "urgencia",
      "in-progress": "urgencia",
      "in-review": "urgencia",
      adjust: "urgencia",
      done: "urgencia",
    });
  });

  it("não ordena a lista recebida no lugar (ela é a mesma do cache de dados)", () => {
    const lista = [task({ id: 1, points: 10 }), task({ id: 2, points: 60 }), task({ id: 3, points: 25 })];
    const antes = ids(lista);
    for (const { id } of COLUMN_ORDERS) sortTasksByColumnOrder(lista, id);
    expect(ids(lista)).toEqual(antes);
  });

  it("prazo: o mais cedo primeiro, sem prazo no fim, empate no mais novo", () => {
    const lista = [
      task({ id: 1, dueDate: null }),
      task({ id: 2, dueDate: "2026-10-20" }),
      task({ id: 3, dueDate: "2026-10-02" }),
      task({ id: 4, dueDate: null }),
      task({ id: 5, dueDate: "2026-10-02" }),
    ];
    // 3 e 5 dividem a data: 5 é o mais novo, então vem primeiro. 1 e 4 não têm prazo: 4, o
    // mais novo do grupo sem prazo, vem antes do 1.
    expect(ids(sortTasksByColumnOrder(lista, "prazo"))).toEqual([5, 3, 2, 4, 1]);
  });

  it("mais recentes: id decrescente, porque a tarefa não volta com createdAt", () => {
    const lista = [task({ id: 7 }), task({ id: 42 }), task({ id: 9 })];
    expect(ids(sortTasksByColumnOrder(lista, "recentes"))).toEqual([42, 9, 7]);
  });

  it("pontos: maior primeiro (valores medidos na base) e empate no mais novo", () => {
    const lista = [
      task({ id: 1, points: 10 }),
      task({ id: 2, points: 60 }),
      task({ id: 3, points: 25 }),
      task({ id: 4, points: 60 }),
      task({ id: 5, points: 15 }),
    ];
    expect(ids(sortTasksByColumnOrder(lista, "pontos"))).toEqual([4, 2, 3, 5, 1]);
  });

  it("alfabética: pelo título, e empate no mais novo", () => {
    const lista = [
      task({ id: 1, title: "Revisar sensor" }),
      task({ id: 2, title: "Calibrar balanca" }),
      task({ id: 3, title: "Calibrar balanca" }),
    ];
    expect(ids(sortTasksByColumnOrder(lista, "alfabetica"))).toEqual([3, 2, 1]);
  });

  it("toda ordenação é total e estável: nada some, nada duplica, duas execuções concordam", () => {
    const lista = [
      task({ id: 1, title: "beta", priority: "low", dueDate: "2026-10-05", points: 10 }),
      task({ id: 2, title: "Alfa", priority: "urgent", dueDate: null, points: 10 }),
      task({ id: 3, title: "Alfa", priority: "high", dueDate: "2026-10-05", points: 10 }),
      task({ id: 4, title: "gama", priority: "urgent", dueDate: "2026-10-05", points: 10 }),
      task({ id: 5, title: "Delta", priority: "medium", dueDate: "2026-10-01", points: 10 }),
    ];
    for (const { id: order } of COLUMN_ORDERS) {
      const uma = sortTasksByColumnOrder(lista, order);
      const outra = sortTasksByColumnOrder(lista, order);
      expect(ids(outra), `ordem ${order} instável`).toEqual(ids(uma));
      expect([...ids(uma)].sort((a, b) => a - b), `ordem ${order} perdeu ou duplicou tarefa`).toEqual([1, 2, 3, 4, 5]);
      expect(ids(uma)).toHaveLength(lista.length);
    }
  });

  it("isColumnOrder recusa o que o storage de outra versão deixou para trás", () => {
    for (const { id } of COLUMN_ORDERS) expect(isColumnOrder(id)).toBe(true);
    for (const lixo of ["prazo ", " PRAZO", "prazo\n", "", null, undefined, 42, {}, ["prazo"], true]) {
      expect(isColumnOrder(lixo), `${JSON.stringify(lixo)} não é ordem`).toBe(false);
    }
  });

  it("a chave é por pessoa e por coluna (DEC-33), e o navegador é o resto do requisito", () => {
    expect(columnOrderStorageKey(42, "to-do")).toBe("dq:column-order:42:to-do");
    expect(columnOrderStorageKey(43, "to-do")).not.toBe(columnOrderStorageKey(42, "to-do"));
    expect(columnOrderStorageKey(42, "done")).not.toBe(columnOrderStorageKey(42, "to-do"));
    // sem id (antes de o useSession resolver) a chave é a do quadro anônimo
    expect(columnOrderStorageKey(null, "to-do")).toBe("dq:column-order:to-do");
    expect(columnOrderStorageKey(undefined, "to-do")).toBe(columnOrderStorageKey(null, "to-do"));
  });

  it("o rótulo vive em um lugar só e nunca some (ordem desconhecida cai em Urgência)", () => {
    expect(COLUMN_ORDERS.map((o) => o.title)).toEqual([
      "Urgência",
      "Prazo",
      "Mais recentes",
      "Pontos",
      "Alfabética",
    ]);
    for (const { id, title } of COLUMN_ORDERS) expect(columnOrderTitle(id)).toBe(title);
    expect(columnOrderTitle("inexistente" as ColumnOrder)).toBe("Urgência");
  });

  it("toda coluna tem uma ordem: o mapa de padrão cobre os cinco status", () => {
    expect(Object.keys(defaultColumnOrders()).sort()).toEqual([...TASK_STATUSES].sort());
  });
});
