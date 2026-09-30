/**
 * User — pure domain contract of the identity aggregate (OND2-B1, SPEC §4.5).
 *
 * Type-only mirror of `backend/models/user/User.ts` (IUser), with the Prisma types replaced:
 * `ProfileVisibility` is declared here as a string-union enum object mirroring the schema enum
 * (public | members_only | private) — structurally identical to the Prisma union, so the model
 * class satisfies it without nominal gaps (contrast DEC-14: TS enums are nominal, unions are not).
 *
 * `status` stays `string` (GAP-02 pattern): `users.status` is a plain String column
 * (pending/active/rejected/suspended/inactive are the values the backend writes today).
 * The rich entity (invariants, creation rules) arrives in OND2-B2.
 */
import type { UserRole } from "./UserRole";

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
  status?: string;
  weekHours?: number;
  createdAt?: Date;
  currentWeekHours?: number;
  profileVisibility?: ProfileVisibility;
  bio?: string | null;
  avatar?: string | null;
  roles?: UserRole[];
}

export type User = IUser;
