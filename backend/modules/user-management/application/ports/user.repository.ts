/**
 * UserRepositoryPort — persistence port of the user-management module (OND2-B2, DEC-05).
 *
 * Declared by `application`, implemented by `infrastructure/repositories`. Returns domain
 * records (never Prisma rows, never the `User` model class — SPEC §4.2). `password` exists on
 * the record for the write paths; the use cases project it away with `toPublicUser` before
 * anything leaves the module (parity with the model's toJSON today).
 *
 * `isProjectMember`/`leadsProject` mirror the CURRENT gateway queries exactly, including the
 * quirk that `projectId` may be undefined (Prisma then ignores the filter — frozen behavior;
 * the adapter reproduces it with a conditional where).
 */
import type { ProfileVisibility, UserRole, UserStatus } from "@/backend/domain";

export interface UserRecord {
  id: number;
  name: string;
  email: string;
  points: number;
  completedTasks: number;
  password: string | null;
  status: UserStatus;
  weekHours: number;
  currentWeekHours: number;
  profileVisibility: ProfileVisibility;
  bio: string | null;
  avatar: string | null;
  roles: UserRole[];
  createdAt?: Date;
}

/** Row shape consumed by the list visibility policy (all fields; the use case filters them). */
export interface UserSummaryRow {
  id: number;
  name: string;
  email: string;
  roles: UserRole[];
  status: UserStatus;
  weekHours: number;
  points: number;
  completedTasks: number;
  avatar: string | null;
  bio: string | null;
}

export type NewUserRecord = Omit<UserRecord, "id" | "createdAt">;

export interface UserStatistics {
  total: number;
  active: number;
  pending: number;
  rejected: number;
  suspended: number;
  totalPoints: number;
  totalTasks: number;
  averagePoints: number;
  averageTasks: number;
}

export interface UserRepositoryPort {
  findById(id: number): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(data: NewUserRecord): Promise<UserRecord>;
  update(record: UserRecord): Promise<UserRecord>;
  delete(id: number): Promise<void>;
  /**
   * Quantas linhas de OUTROS registros ainda apontam para este usuário (V4-1, DEC-55).
   *
   * Existe porque 16 das 23 FKs que apontam para `users` são `RESTRICT` (default do Prisma, sem
   * `onDelete`): deixar o `delete` correr produz P2003 e a rota devolve 500 com a mensagem crua
   * do Prisma no corpo. Contar antes permite recusar com 409 e uma frase que o humano entende.
   *
   * Conta só as FKs que BLOQUEIAM. As 7 com `onDelete: Cascade` (`project_members`,
   * `task_assignees`, `task_user_progress`, `work_sessions`, `weekly_hours_history`,
   * `user_badges.userId`, `notifications`) somem junto com o usuário e não bloqueiam nada —
   * contá-las faria um cadastro recém-registrado parecer impossível de excluir.
   */
  countBlockingDependencies(userId: number): Promise<number>;
  findPending(): Promise<UserRecord[]>;
  /** status=active, ordered by name asc, with every visibility-relevant field. */
  findActiveUsers(): Promise<UserSummaryRow[]>;
  findTopByPoints(limit: number): Promise<UserRecord[]>;
  findTopByTasks(limit: number): Promise<UserRecord[]>;
  findAll(): Promise<UserRecord[]>;
  /** CURRENT quirk (frozen by the golden): returns ALL users regardless of visibility. */
  findByProfileVisibility(visibility: ProfileVisibility): Promise<UserRecord[]>;
  getUsersByRole(): Promise<Record<string, number>>;
  getUsersByStatus(): Promise<Record<string, number>>;
  getUserStatistics(): Promise<UserStatistics>;
  isProjectMember(userId: number, projectId?: number): Promise<boolean>;
  leadsProject(userId: number, projectId?: number): Promise<boolean>;
}
