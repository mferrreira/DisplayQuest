/**
 * Cache compartilhado do equipar (plan-v17 S04, should-fix da review S03, R7).
 *
 * Equipar acontece só no picker da Configurações; as outras superfícies do perfil
 * (bloco Badges, vitrine do card de identidade) precisam acompanhar o estado sem
 * remontar. A casa não tem QueryClientProvider montado, então a sincronização é este
 * seam mínimo: assinantes por userId, sinal de badgeId + estado novo. Quem equipar
 * publica depois da rota responder; assinar é barato e o unsubscribe é obrigatório
 * no cleanup do useEffect.
 */

type EquippedListener = (badgeId: number, next: boolean) => void;

const listeners = new Map<number, Set<EquippedListener>>();

export function subscribeEquipped(userId: number, listener: EquippedListener): () => void {
  let set = listeners.get(userId);
  if (!set) {
    set = new Set();
    listeners.set(userId, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
  };
}

export function markEquipped(userId: number, badgeId: number, next: boolean): void {
  const set = listeners.get(userId);
  if (!set) return;
  for (const listener of set) listener(badgeId, next);
}
