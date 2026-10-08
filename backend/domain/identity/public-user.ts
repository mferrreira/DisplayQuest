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
  roles: UserRole[];
  createdAt?: Date;
}

export function toPublicUser(user: {
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
  roles: UserRole[];
  createdAt?: Date;
}): PublicUser {
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
    roles: user.roles,
    createdAt: user.createdAt,
  };
}
