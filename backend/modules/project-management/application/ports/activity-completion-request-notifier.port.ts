/**
 * ActivityCompletionRequestNotifierPort — porta local de publicação da notificação de solicitação
 * de conclusão (fix 4, 2026-10-28). O módulo de projeto NÃO conhece o módulo de notificações: o
 * composition root injeta o adaptador que chama `publishEvent`.
 *
 * O `actor` é parâmetro porque a notificação sai do use case com `systemActor(SYSTEM_EVENT)`
 * (DEC-54): quem pediu é uma pessoa, mas ela não publica — o sistema anuncia o evento que já
 * aconteceu, mesma gramática dos publicadores de issue e relatório.
 */
import type { ActorRef } from "@/backend/domain";

export interface CompletionRequestNotification {
  activityId: number;
  userIds: number[];
  title: string;
  message: string;
}

export interface ActivityCompletionRequestNotifierPort {
  publishRequest(notification: CompletionRequestNotification, actor: ActorRef): Promise<void>;
}
