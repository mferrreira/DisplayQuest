import { applyStoreDiscount } from "@/backend/domain"
import type { BadgeEffect } from "@/backend/domain"

/**
 * StorePrice — plan-v15 S08 (R14, tela). Mostra o preço EFETIVO da loja com o desconto da
 * passiva equipada; o preço da tabela aparece riscado só quando há desconto. O piso 1 vem
 * da regra pura `applyStoreDiscount`, não da tela.
 */
export function StorePrice({ price, effects, className = "" }: { price: number; effects: BadgeEffect[]; className?: string }) {
  const effective = applyStoreDiscount(price, effects)
  if (effective === price) {
    return <span className={className}>{price}</span>
  }
  return (
    <span data-testid="store-price" className={className}>
      <span className="font-semibold text-primary">{effective}</span>
      <span className="text-xs text-muted-foreground line-through">de {price}</span>
    </span>
  )
}
