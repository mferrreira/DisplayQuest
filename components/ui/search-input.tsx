import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/utils";

/**
 * SearchInput — plan-v6 · V6-1 (RF-V6.2).
 *
 * O campo de busca existe uma vez: borda sutil, canto arredondado da escala, icone de
 * lupa simples e peso visual contido (design-system, "Search and filters"). A busca do
 * quadro (`board-toolbar.tsx`) tem comportamento proprio de breakpoint (lupa-toggle so
 * abaixo de `sm`) e NAO e convertida nesta onda; o primitivo cobre as buscas simples
 * das telas (projetos, listas).
 *
 * Primitivo puro (RF-V6.2 R3): controlado por props, sem debounce interno, sem fetch e
 * sem contexto. O `aria-label` e obrigatorio — controle sem nome acessivel e o buraco
 * medido no `SelectTrigger` (DEC-86).
 */
export interface SearchInputProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}

export function SearchInput({ value, onValueChange, placeholder, ariaLabel, className }: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="pl-9"
      />
    </div>
  );
}
