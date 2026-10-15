/**
 * plan-v6 · V6-1 (RF-V6.2 R2): a UNICA fonte de status→cor/label.
 *
 * As duas copias locais (`project-list.tsx` e `project-detail-dialog.tsx`) pararam de
 * definir os proprios mapas e importam daqui. As maps de tarefa/privacidade do cartao
 * migram para ca na V6-3, e as do dialog somem com ele na V6-5 (DEC-111: uma fonte so,
 * sem variante local).
 *
 * As classes usam apenas os tokens semanticos de `app/globals.css` (`--success`,
 * `--info`, `--muted`), que o bloco `.dark` ja redefine — nenhuma classe carrega par
 * `dark:` casado a mao, e nenhuma sai da paleta crua (RF-V6.2 R4, AC-V6-01).
 */
import type { Project } from "@/contexts/types";

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
