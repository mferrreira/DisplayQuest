"use client";

import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils/utils";

/**
 * PageHeader — plan-v6 · V6-1 (RF-V6.2).
 *
 * O cabecalho de pagina existe uma vez: icone opcional, titulo (o elemento textual
 * dominante), descricao quieta e acao contextual a direita. Renderiza exatamente um
 * `<h1>` por pagina (AC-V6-04) — as 11 paginas que hoje escrevem o proprio `h1` com 8
 * classNames distintos passam a usar este primitivo nas ondas de tela.
 *
 * Titulo do navegador (DEC-188, AC-V6-36): a prop `title` e obrigatoria e um efeito
 * escreve `document.title = "<titulo> · DisplayQuest"`. Nao ha RSC nem `layout.tsx` por
 * segmento nesta base (as 13 `page.tsx` sao client e `metadata` e server-only), entao o
 * mecanismo mora aqui: tela que adota o primitivo ganha titulo proprio sem trabalho
 * extra. Rotas sem `PageHeader` herdam o fallback de `app/layout.tsx`.
 *
 * Primitivo puro (RF-V6.2 R3): props declarativas, sem busca de dados e sem useContext.
 */
export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, icon: Icon, actions, className }: PageHeaderProps) {
  useEffect(() => {
    document.title = `${title} · DisplayQuest`;
  }, [title]);

  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="flex items-start gap-3">
        {Icon ? <Icon className="mt-1 h-7 w-7 shrink-0 text-primary" aria-hidden="true" /> : null}
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
