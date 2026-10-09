/**
 * User fixtures — shapes mirror the `users` entity contract (entities/user.ts
 * `userSchema`, itself a mirror of prisma `model users`). pt-BR content (R9).
 */
import type { User } from "@/entities/user";

let nextId = 500;

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: nextId++,
    name: "Usuário de teste",
    email: "teste@lab.com",
    points: 0,
    completedTasks: 0,
    status: "active",
    weekHours: 0,
    createdAt: new Date().toISOString(),
    currentWeekHours: 0,
    roles: ["VOLUNTARIO"],
    avatar: null,
    bio: null,
    profileVisibility: "public",
    ...overrides,
  };
}

/** Canonical people list used by board component tests and E2E MSW. */
export function boardUsersFixture(): User[] {
  return [
    makeUser({
      id: 2,
      name: "Coordenador",
      email: "coordenador@lab.com",
      points: 100,
      completedTasks: 5,
      weekHours: 20,
      roles: ["COORDENADOR"],
    }),
    makeUser({
      id: 3,
      name: "Pesquisadora",
      email: "pesquisadora@lab.com",
      points: 40,
      completedTasks: 2,
      weekHours: 12,
      roles: ["PESQUISADOR"],
    }),
  ];
}
