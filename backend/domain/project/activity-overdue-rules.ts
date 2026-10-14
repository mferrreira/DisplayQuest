/**
 * Regras puras do atraso de atividade (V5-8, DEC-64).
 *
 * A varredura diária do cron (lib/services/cron-service.ts) procura atividade vencida
 * e não aprovada e gera UMA notificação prioritária por atividade — a guarda de "uma só"
 * é a coluna `overdueNotifiedAt` (schema), não estas funções. O prazo é
 * `activityPeriod().periodoFim`: derivado dos meses marcados, nunca gravado (DEC-132).
 *
 * Atraso é dia civil DEPOIS do prazo — o próprio dia do prazo ainda é dentro do
 * período (congelado em teste). A data na frase sai por substring `dd/mm/aaaa`, nunca
 * por `new Date` (lição DEC-132: `new Date("2026-10-31")` é UTC e troca o dia no fuso).
 */
import { civilDaysBetween } from "@/backend/domain/time/civil-day";

import { activityPeriod } from "./cronograma-rules";

/** Tipo da notificação no vocabulário de `notifications.type` — o painel pinta por ele. */
export const ACTIVITY_OVERDUE_NOTIFICATION_TYPE = "ACTIVITY_OVERDUE";

/** Título único da notificação de atraso; a mensagem carrega atividade, projeto e prazo. */
export const ACTIVITY_OVERDUE_TITLE = "Atividade atrasada";

/** O que a regra de atraso lê de uma atividade: só os meses marcados. */
export interface OverdueActivityView {
  firstMonth: string;
  lastMonth: string;
}

/**
 * Vencida é hoje > último dia do último mês marcado. O dia do prazo em si não é atraso:
 * a atividade "vence" à meia-noite seguinte (dia civil, DEC-132).
 */
export function isActivityOverdue(activity: OverdueActivityView, today: string): boolean {
  const { periodoFim } = activityPeriod(activity.firstMonth, activity.lastMonth);
  return civilDaysBetween(periodoFim, today) > 0;
}

/** Data civil `YYYY-MM-DD` na grafia do texto: `dd/mm/aaaa` por substring. */
export function formatCivilDate(civilDay: string): string {
  const [year, month, day] = civilDay.split("-");
  return `${day}/${month}/${year}`;
}

export function activityOverdueMessage(
  projectName: string,
  description: string,
  periodoFim: string,
): string {
  return (
    `A atividade "${description}" do projeto "${projectName}" venceu em ` +
    `${formatCivilDate(periodoFim)} e ainda não foi concluída.`
  );
}

/**
 * Audiência da notificação de atraso (DEC-64): líder do projeto + coordenadores/gerentes
 * globais. O líder vem primeiro e a deduplicação é por id — o líder que também é
 * coordenador recebe UMA notificação, não duas.
 */
export function overdueNotificationRecipients(
  leaderId: number | null,
  globalManagerIds: number[],
): number[] {
  const ids = [leaderId, ...globalManagerIds].filter(
    (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0,
  );
  return [...new Set(ids)];
}
