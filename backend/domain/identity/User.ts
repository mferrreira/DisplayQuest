/**
 * User — pure domain contract of the identity aggregate (OND2-B1, SPEC §4.5).
 *
 * `ProfileVisibility` is declared here as a string-union enum object mirroring the schema enum
 * (public | members_only | private) — structurally identical to the Prisma union (contrast
 * DEC-14: TS enums are nominal, unions are not).
 *
 * `status` is `UserStatus` (B10 · D9, fecha GAP-02 — DEC-125): `users.status` remains a plain
 * String column, but the domain record carries the vocabulary the backend writes
 * (pending/active/rejected/suspended — DEC-95: `inactive` is not a writable status, inactivating
 * means `suspended`). Repository adapters reconcile the column through `toUserStatus`, so a row
 * outside the vocabulary fails loudly at the boundary instead of leaking an untyped string.
 */
import type { UserRole } from "./UserRole";
import type { UserStatus } from "./UserStatus";

export const ProfileVisibility = {
  PUBLIC: "public",
  MEMBERS_ONLY: "members_only",
  PRIVATE: "private",
} as const;

export type ProfileVisibility = (typeof ProfileVisibility)[keyof typeof ProfileVisibility];

export const PROFILE_VISIBILITIES = Object.values(ProfileVisibility) as ProfileVisibility[];

export function isProfileVisibility(value: unknown): value is ProfileVisibility {
  return typeof value === "string" && (PROFILE_VISIBILITIES as string[]).includes(value);
}

export interface IUser {
  id?: number;
  name: string;
  email: string;
  points?: number;
  completedTasks?: number;
  password?: string | null;
  status?: UserStatus;
  weekHours?: number;
  createdAt?: Date;
  currentWeekHours?: number;
  profileVisibility?: ProfileVisibility;
  bio?: string | null;
  avatar?: string | null;
  roles?: UserRole[];
}

export type User = IUser;
