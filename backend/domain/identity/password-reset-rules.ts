import { ValidationError } from "../errors";

/**
 * plan-v24 S01 — regras puras da solicitação de troca de senha (ADR-001..ADR-004).
 *
 * As frases congeladas:
 *  - validação: as MESMAS do formulário de cadastro (`register-user.use-case.ts`) —
 *    obrigatoriedade e a senha mínima de 6;
 *  - resposta da rota pública: a mensagem neutra, idêntica para email existente e
 *    inexistente (ADR-002, INV2 — decisão do dono em 2026-11-12: a resposta não revela
 *    se o email existe);
 *  - duplo pending: a frase da recusão, única fonte para rota, use case e teste
 *    (padrão DEC-90: quem fixa a frase importa do domínio, não copia).
 */

export const PASSWORD_RESET_REQUIRED_MESSAGE = "Email e senha são obrigatórios";
export const PASSWORD_RESET_SHORT_PASSWORD_MESSAGE = "A senha deve ter pelo menos 6 caracteres";
export const PASSWORD_RESET_NEUTRAL_MESSAGE =
  "Se o email estiver cadastrado, a solicitação será analisada pela gestão. Você poderá entrar com a nova senha depois da aprovação.";
export const PASSWORD_RESET_DUPLICATE_MESSAGE = "Já existe solicitação pendente para este e-mail";

/** Vocabulário fechado de status da solicitação (estados do MODELO §5). */
export const PASSWORD_RESET_STATUSES = ["pending", "approved", "rejected"] as const;
export type PasswordResetStatus = (typeof PASSWORD_RESET_STATUSES)[number];

export function normalizeResetEmail(email: string): string {
  return String(email).toLowerCase().trim();
}

/**
 * Valida e normaliza a entrada do formulário. Retorna o par normalizado; nunca a senha
 * normalizada — ela vai ao hasher como foi digitada (mesma regra do cadastro).
 */
export function validatePasswordResetInput(input: {
  email?: string | null;
  password?: string | null;
}): { email: string; password: string } {
  const email = input.email;
  const password = input.password;
  if (!email || !password) {
    throw new ValidationError(PASSWORD_RESET_REQUIRED_MESSAGE);
  }
  if (String(password).length < 6) {
    throw new ValidationError(PASSWORD_RESET_SHORT_PASSWORD_MESSAGE);
  }
  return { email: normalizeResetEmail(email), password: String(password) };
}
