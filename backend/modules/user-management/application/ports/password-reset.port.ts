import type { PasswordResetStatus } from "@/backend/domain";

/**
 * PasswordResetPort — persistência da solicitação de troca de senha (plan-v24, S01).
 *
 * Port declarada por `application`, implementada por `infrastructure/repositories`.
 * O record traz a hash da senha nova; os use cases projetam a senha antes de qualquer
 * leitura sair do módulo (mesma regra de `toPublicUser` para a conta — INV1/CA6).
 *
 * A linha vive só nesta família: `users.password` é escrita pelo caminho de aprovação
 * (S02) lendo o `password` deste record — nunca pela rota.
 */
export interface PasswordResetRecord {
  id: number;
  email: string;
  /** Hash bcrypt da senha nova, custo 12. Texto puro nunca entra aqui (INV1). */
  password: string;
  status: PasswordResetStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: number | null;
}

export interface NewPasswordResetRecord {
  email: string;
  password: string;
}

export interface PasswordResetPort {
  createPending(data: NewPasswordResetRecord): Promise<PasswordResetRecord>;
  findPendingByEmail(email: string): Promise<PasswordResetRecord | null>;
  findById(id: number): Promise<PasswordResetRecord | null>;
  listPending(): Promise<PasswordResetRecord[]>;
  update(record: PasswordResetRecord): Promise<PasswordResetRecord>;
}
