/**
 * UserRole — pure domain enum (SPEC §4.3, AC-00-09).
 *
 * The values MIRROR `enum UserRole` in prisma/schema.prisma. The Prisma-generated symbol is
 * NOT imported here: RG-01 forbids the core from knowing the ORM. The adapter keeps its own
 * mapping, and `tests/unit/modules/_foundations/enums-mirror-schema.test.ts` is what proves
 * the two stay identical.
 *
 * Shape note (AGENT.md §5): the object + union-type pair is structurally what
 * `@prisma/client`'s `UserRole` already is, so swapping an import for this module does not
 * change the payload shape, only the origin of the type.
 */
export const UserRole = {
  COORDENADOR: "COORDENADOR",
  GERENTE: "GERENTE",
  LABORATORISTA: "LABORATORISTA",
  PESQUISADOR: "PESQUISADOR",
  GERENTE_PROJETO: "GERENTE_PROJETO",
  COLABORADOR: "COLABORADOR",
  VOLUNTARIO: "VOLUNTARIO",
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES = Object.values(UserRole) as UserRole[];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as string[]).includes(value);
}
