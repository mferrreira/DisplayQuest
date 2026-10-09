/**
 * user-denied-messages — as mensagens 403 congeladas das rotas de usuários (D4, B6-4).
 *
 * Moram no domínio porque são CONTRATO, não detalhe de módulo: a rota as entrega ao assert
 * compartilhado (AssertCanManageUsersUseCase) e os use cases as carregam como regra própria.
 * Viver no `modules/` obrigaria a rota a importar `@/backend/modules/...`, proibido pelo RG-06
 * (a rota alcança o backend só pelo composition root ou pelo domínio).
 *
 * Os três textos foram MEDIDOS nas rotas legado e cada um vale por si:
 *  - "Sem permissão para criar usuários" — POST /api/users (não é o default).
 *  - "Acesso negado." — /api/users/approve, COM PONTO FINAL (diferente do default só pelo ponto).
 *  - "Não autorizado" — GET/PATCH /api/users/[id]/profile.
 * O default "Acesso negado" (users/[id], status, roles, points, project-hours) é o de
 * `assert-permission.ts` e não aparece aqui de propósito.
 */
export const CREATE_USER_DENIED_MESSAGE = "Sem permissão para criar usuários"
export const PENDING_MODERATION_DENIED_MESSAGE = "Acesso negado."
export const PROFILE_DENIED_MESSAGE = "Não autorizado"
