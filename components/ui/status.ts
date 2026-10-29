/**
 * plan-v6 · V6-1 (RF-V6.2 R2): a UNICA fonte de status→cor/label.
 *
 * As telas de lista e detalhe do projeto importam daqui em vez de definir seus mapas locais.
 * Os mapas de tarefa/privacidade do cartao migraram para ca na V6-3; o detalhe de projeto
 * também usa esta fonte na rota dedicada (DEC-111: uma fonte só,
 * sem variante local).
 *
 * As classes usam apenas os tokens semanticos de `app/globals.css` (`--success`,
 * `--info`, `--muted`), que o bloco `.dark` ja redefine — nenhuma classe carrega par
 * `dark:` casado a mao, e nenhuma sai da paleta crua (RF-V6.2 R4, AC-V6-01).
 */
import type { Project } from "@/contexts/types";
import type { Task } from "@/entities/task";

export const projectStatusBadgeClass: Record<Project["status"], string> = {
  // `border-transparent` nao e necessario: a variante default do Badge ja o traz, e o `cn`
  // faz dedupe via tailwind-merge.
  active: "bg-success/15 text-success",
  completed: "bg-info/15 text-info",
  archived: "bg-muted text-muted-foreground",
};

export const projectStatusLabel: Record<Project["status"], string> = {
  active: "Ativo",
  completed: "Concluído",
  archived: "Arquivado",
};

/** Tokens de gráfico para os mesmos status — compartilhados entre Home e Dashboard. */
export const projectStatusChartColor: Record<Project["status"], string> = {
  active: "hsl(var(--success))",
  completed: "hsl(var(--info))",
  archived: "hsl(var(--muted-foreground))",
};

/**
 * V6-3 · mapas de TAREFA (RF-V6.2 R2 — "as do cartao migram na V6-3"). As copias locais
 * de `task-card.tsx` (`STATUS_LABEL`/`PRIORITY_LABEL`/`statusBadgeClass`/
 * `priorityBadgeClass`, todas com degradê saturado + `text-white` + par `dark:` a mao)
 * sairam; o cartao importa daqui. O dialog mantem as dele ate a V6-5, quando sai.
 *
 * Em Revisao usa o token `--review` (nasce em `globals.css` na mesma onda — o
 * design-system reserva roxo para informacao de revisao). Urgente e o unico badge
 * CHUMBO (destructive cheio): a escalada baixa→media→alta→urgente precisa de um degrau
 * a mais que tintado, e `destructive` e o token de alerta da base.
 */
/**
 * Rótulos de tarefa em caixa de frase — para os lugares onde o registro do badge
 * (CAIXA ALTA) não cabe: lengenda de gráfico, frase corrida do feed. Nasce depois de o
 * review V6-11 (#5/#12) medir o vocabulário re-forkado em `PROJECT_STATUS_META` e em
 * `STATUS_SENTENCE` (o mesmo modo de falha que a DEC-95/96 fechou no usuário).
 */
export const taskStatusSentenceLabel: Record<Task["status"], string> = {
  "to-do": "A Fazer",
  "in-progress": "Fazendo",
  "in-review": "Em Revisão",
  adjust: "Ajustes",
  done: "Concluída",
};

export const taskStatusBadgeClass: Record<Task["status"], string> = {
  "to-do": "bg-muted text-muted-foreground",
  "in-progress": "bg-info/15 text-info",
  "in-review": "bg-review/15 text-review",
  adjust: "bg-warning/15 text-warning",
  done: "bg-success/15 text-success",
};

export const taskStatusLabel: Record<Task["status"], string> = {
  // O h2 da coluna e "Concluido" (a coluna); o selo do cartao fala da TAREFA — por isso
  // "Concluida". Os dois sempre existiram assim; a unica fonte guarda as duas palavras
  // porque so a do cartao mora aqui.
  "to-do": "A FAZER",
  "in-progress": "FAZENDO",
  "in-review": "EM REVISÃO",
  adjust: "AJUSTES",
  done: "CONCLUÍDA",
};

export const taskStatusChartColor: Record<Task["status"], string> = {
  "to-do": "hsl(var(--muted-foreground))",
  "in-progress": "hsl(var(--info))",
  "in-review": "hsl(var(--review))",
  adjust: "hsl(var(--warning))",
  done: "hsl(var(--success))",
};

export const taskPriorityBadgeClass: Record<Task["priority"], string> = {
  low: "bg-success/15 text-success",
  medium: "bg-warning/15 text-warning",
  high: "bg-destructive/15 text-destructive",
  urgent: "bg-destructive text-destructive-foreground",
};

export const taskPriorityLabel: Record<Task["priority"], string> = {
  low: "BAIXA",
  medium: "MÉDIA",
  high: "ALTA",
  urgent: "URGENTE",
};
