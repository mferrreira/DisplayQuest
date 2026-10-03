"use client"

/**
 * plan-v3 OND3-C — a preferência de ordenação de cada coluna, guardada no navegador da pessoa.
 *
 * Estado local do quadro, não estado de link: o filtro que já é URL (`nuqs`) continua sendo
 * link compartilhável, e a ordem escolhida é preferência de quem está olhando (DEC-33). Por isso
 * `localStorage` e não query string.
 *
 * A leitura acontece **depois** da montagem, como em `useSessionAlertSound`: no servidor não há
 * `localStorage`, e ler antes da hidratação faria o quadro aparecer com uma ordem e trocar na
 * frente da pessoa. A primeira pintura usa sempre `DEFAULT_COLUMN_ORDER`.
 *
 * Quando `userId` chega (o `useSession` resolve depois do primeiro render), o efeito relê as
 * cinco chaves: até lá a preferência visível é a de quem ainda não tem id — e some, em vez de
 * ficar gravada na chave de outra pessoa.
 */
import { useCallback, useEffect, useState } from "react"
import { readJson, writeJson } from "@/lib/client-storage"
import type { TaskStatus } from "@/entities/task"
import {
  DEFAULT_COLUMN_ORDER,
  columnOrderStorageKey,
  defaultColumnOrders,
  isColumnOrder,
  type ColumnOrder,
} from "../utils/column-order"
import { TASK_STATUSES } from "../utils/move-rules"

export interface UseColumnOrders {
  /** Ordem vigente de cada coluna. */
  orders: Record<TaskStatus, ColumnOrder>
  /** Troca a ordem de uma coluna e persiste. */
  setOrder: (status: TaskStatus, order: ColumnOrder) => void
  /** `false` até a leitura do navegador acontecer. */
  loaded: boolean
}

export function useColumnOrders(userId: number | null | undefined): UseColumnOrders {
  const [orders, setOrders] = useState<Record<TaskStatus, ColumnOrder>>(defaultColumnOrders)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const stored = defaultColumnOrders();
    for (const status of TASK_STATUSES) {
      const value = readJson<unknown>(
        columnOrderStorageKey(userId, status),
        DEFAULT_COLUMN_ORDER,
      );
      // JSON válido que não é ordem (escrito por outra versão) volta ao padrão em vez de
      // virar opção sem par no menu.
      if (isColumnOrder(value)) stored[status] = value;
    }
    setOrders(stored);
    setLoaded(true);
  }, [userId])

  const setOrder = useCallback(
    (status: TaskStatus, order: ColumnOrder) => {
      setOrders((prev) => (prev[status] === order ? prev : { ...prev, [status]: order }))
      writeJson(columnOrderStorageKey(userId, status), order)
    },
    [userId],
  )

  return { orders, setOrder, loaded }
}
