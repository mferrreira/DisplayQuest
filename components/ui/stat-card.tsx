import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/utils";

/**
 * StatCard — plan-v6 · V6-1 (RF-V6.2).
 *
 * O bloco de resumo existe uma vez. Hoje o padrao `CardHeader className="flex flex-row
 * items-center justify-between space-y-0 pb-2"` esta copiado em 6 arquivos (AC-V6-05);
 * depois desta onda a unica ocorrencia e dentro deste primitivo.
 *
 * O icone e `LucideIcon` com tamanho/cor do primitivo (h-4, `--muted-foreground`) — o
 * mesmo par que as 6 copias substituidas ja usavam, agora controlado por dentro.
 *
 * Primitivo puro (RF-V6.2 R3): recebe label, valor, dica e icone por props; nao busca
 * dado nenhum e nao le contexto.
 */
export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({ label, value, hint, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        {Icon ? <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : null}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
