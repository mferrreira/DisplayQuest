/**
 * backend/domain/identity/profile-visibility-rules.ts — a regra que o campo
 * `users.profileVisibility` promete (V5-12, DEC-143/177).
 *
 * O campo existe desde sempre, é gravado na criação e editado na aba Configurações, e o guia
 * descreve os três valores — mas nenhuma decisão no backend os lia (achado medido 2026-10-13,
 * D-AK). Esta é a decisão pura: `public` é o aberto de hoje, `members_only` casa por projeto
 * em comum, `private` é próprio + gestão. O gate antigo (`self OU MANAGE_USERS`) é exatamente
 * o ramo `private` — o que muda é que `public` passa a abrir e `members_only` passa a casar.
 *
 * O que a regra NÃO é: visibilidade de LISTA (essa é `resolveUserListVisibility`, OND2-B2, e
 * decide CAMPOS por papel do ator) nem ranking (nome e pontos são do pódio, DEC-137). A regra
 * governa a LEITURA DE PERFIL: quem enxerga o cartão de uma pessoa.
 */
import { hasPermission } from "@/backend/domain/identity/has-permission";
import type { ActorRef } from "@/backend/domain/identity/actor-ref";
import type { ProfileVisibility } from "@/backend/domain/identity/User";

export interface ProfileVisibilityTarget {
  id: number;
  profileVisibility: ProfileVisibility;
  /** Status do usuário (`active` | `pending` | `rejected` | `suspended`). */
  status: string;
}

/**
 * `sharesProject` é MEDIDO pelo chamador (porta do módulo): a regra pura não consulta
 * nada — quem sabe se há vínculo em comum é quem lê `project_members`.
 */
export function canActorViewProfile(
  actor: ActorRef,
  target: ProfileVisibilityTarget,
  sharesProject: boolean,
): boolean {
  // Rotina de sistema: o bypass declarado do DEC-54 (nenhuma rota fabrica ator de sistema).
  if (actor.kind === "system") return true;
  // O próprio sempre — qualquer valor, qualquer status.
  if (actor.id === target.id) return true;
  // A "administração" da tabela do guia é MANAGE_USERS — a mesma que edita o perfil (DEC-138).
  if (hasPermission(actor.roles, "MANAGE_USERS")) return true;
  // Visibilidade descreve quem está dentro do sistema: pending/rejected/suspended seguem o
  // gate antigo (próprio + gestão) — mesma linha de DEC-55.
  if (target.status !== "active") return false;

  switch (target.profileVisibility) {
    case "public":
      return true;
    case "members_only":
      return sharesProject;
    case "private":
      return false;
    default:
      // Valor fora dos três (linha corrompida): conservador — invisível.
      return false;
  }
}
