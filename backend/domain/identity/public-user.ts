/**
 * toPublicUser — pure projection of a user record to its transport shape (OND2-B2, R2).
 *
 * Mirrors `User.toPublicObject()` (the model's toJSON) field-for-field: the password NEVER
 * leaves the record. The HTTP adapters serialize exactly this shape today, so returning it
 * from the use cases preserves the payload form (AGENT.md §5.1, DEC-12).
 */
import type { ProfileVisibility, UserRole, UserStatus } from "@/backend/domain";

export interface PublicUser {
  id?: number;
  name: string;
  email: string;
  points: number;
  completedTasks: number;
  status: UserStatus;
  weekHours: number;
  currentWeekHours: number;
  profileVisibility: ProfileVisibility;
  bio: string | null;
  avatar: string | null;
  /** V5-3 (DEC-137): chave da imagem de capa no bucket. Sempre presente no payload. */
  bannerKey: string | null;
  /**
   * V5-4a (DEC-138): os dados de pessoa que o perfil mostra. `cpf` NÃO está aqui — a leitura do
   * CPF é restrita (próprio OU MANAGE_USERS) e sai só por `toPublicUserWithCpf`, chamada depois
   * de `canActorReadUserCpf` responder "sim".
   */
  registrationNumber: string | null;
  course: string | null;
  scholarshipType: string | null;
  fundingAgency: string | null;
  fundingAgencyOther: string | null;
  level: string | null;
  roles: UserRole[];
  createdAt?: Date;
}

export type PublicUserWithCpf = PublicUser & { cpf: string | null };

interface PublicUserSource {
  id?: number;
  name: string;
  email: string;
  points: number;
  completedTasks: number;
  status: UserStatus;
  weekHours: number;
  currentWeekHours: number;
  profileVisibility: ProfileVisibility;
  bio: string | null;
  avatar: string | null;
  /** Opcional na ENTRADA: chamadores antigos (e fixtures) não conhecem a coluna ainda. */
  bannerKey?: string | null;
  /** Opcional na ENTRADA, pelo mesmo motivo do `bannerKey`. */
  registrationNumber?: string | null;
  course?: string | null;
  scholarshipType?: string | null;
  fundingAgency?: string | null;
  fundingAgencyOther?: string | null;
  level?: string | null;
  roles: UserRole[];
  createdAt?: Date;
}

export function toPublicUser(user: PublicUserSource): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    points: user.points,
    completedTasks: user.completedTasks,
    status: user.status,
    weekHours: user.weekHours,
    currentWeekHours: user.currentWeekHours,
    profileVisibility: user.profileVisibility,
    bio: user.bio,
    avatar: user.avatar,
    bannerKey: user.bannerKey ?? null,
    registrationNumber: user.registrationNumber ?? null,
    course: user.course ?? null,
    scholarshipType: user.scholarshipType ?? null,
    fundingAgency: user.fundingAgency ?? null,
    fundingAgencyOther: user.fundingAgencyOther ?? null,
    level: user.level ?? null,
    roles: user.roles,
    createdAt: user.createdAt,
  };
}

/**
 * Leitura em que a pessoa tem direito ao próprio CPF, ou a gestão está do outro lado.
 * O gate é `canActorReadUserCpf`, e ele mora no use case: esta função não decide nada,
 * só projeta o campo depois de a decisão ter sido tomada.
 */
export function toPublicUserWithCpf(
  user: PublicUserSource & { cpf?: string | null },
): PublicUserWithCpf {
  return { ...toPublicUser(user), cpf: user.cpf ?? null };
}
