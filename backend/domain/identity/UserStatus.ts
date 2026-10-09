/**
 * UserStatus — pure domain enum (B10 · D9, fecha GAP-02; DEC-125).
 *
 * `users.status` is a plain String column in prisma/schema.prisma, but the vocabulary the
 * backend WRITES is exactly these four values (DEC-95: `inactive` is not a writable status —
 * inactivating means `suspended`). The vocabulary guard
 * `tests/unit/modules/user-management/user-status-vocabulary.test.ts` pins this enum against
 * the decision paths and the panel options.
 *
 * `toUserStatus` is the read-boundary reconciliation: repository adapters map Prisma rows
 * through it, so a row carrying a value outside the vocabulary fails loudly (naming the
 * value) instead of leaking an untyped string into the domain.
 */
import { ValidationError } from "../errors/DomainError";

export const UserStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const USER_STATUSES = Object.values(UserStatus) as UserStatus[];

export function isUserStatus(value: unknown): value is UserStatus {
  return typeof value === "string" && (USER_STATUSES as string[]).includes(value);
}

export function toUserStatus(value: unknown): UserStatus {
  if (!isUserStatus(value)) {
    throw new ValidationError(`Status de usuário inválido: ${JSON.stringify(value)}`);
  }
  return value;
}
