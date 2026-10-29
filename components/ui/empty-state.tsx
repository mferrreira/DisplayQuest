import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils/utils";

/**
 * EmptyState — plan-v6 · V6-1 (RF-V6.2).
 *
 * O estado vazio existe uma vez: icone opcional, titulo, descricao opcional e acao
 * contextual opcional. Sem artwork decorativo (DEC-109) — a pagina carrega a identidade
 * no layout e na tipografia, nao numa ilustracao. O icone e `LucideIcon` com tamanho e
 * cor do primitivo (h-6, `--muted-foreground`): chamada nenhuma traz ícone grande ou
 * colorido por dentro do padrao que existe para unificar.
 *
 * Primitivo puro (RF-V6.2 R3): props declarativas, sem busca e sem contexto.
 */
export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 py-12 text-center", className)}>
      {Icon ? <Icon className="mb-1 h-6 w-6 text-muted-foreground" aria-hidden="true" /> : null}
      <p className="text-base font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
