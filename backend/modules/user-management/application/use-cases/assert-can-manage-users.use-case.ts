/**
 * AssertCanManageUsersUseCase — o assert das rotas de usuários em que a ordem MEDIDA coloca o
 * gate ANTES de qualquer leitura do request (D4, B6-4): status, roles e points gateavam antes
 * da validação do id; POST /users e POST /users/approve gateavam antes do parse do corpo.
 * Sem o assert, a validação (que tem mensagens próprias congeladas — "Usuário inválido",
 * "Ação inválida", "ID do usuário e ação são obrigatórios") passaria na frente do 403 e a
 * ordem medida invertia. Padrão do AssertCanPublishNotificationEventUseCase (B6-2b), do
 * AssertCanManagePurchasesUseCase (B6-2d) e dos asserts do B6-3.
 *
 * A MENSAGEM é parâmetro porque as rotas congelaram textos diferentes para a MESMA permissão:
 * default "Acesso negado" (status/roles/points), "Acesso negado." com ponto final (approve),
 * "Sem permissão para criar usuários" (POST /users). A decisão é uma regra só —
 * MANAGE_USERS — e mora aqui; a string é contrato de rota, não decisão.
 *
 * Os use cases de destino rechecam no mesmo ator: o assert é a ordem, o gate é a autoridade.
 */
import { requireActorPermission } from "@/backend/domain/identity"
import type { ActorRef } from "@/backend/domain"

export class AssertCanManageUsersUseCase {
  execute(command: { actor: ActorRef; deniedMessage?: string }): void {
    requireActorPermission(command.actor, "MANAGE_USERS", command.deniedMessage)
  }
}
