/**
 * Project fixtures — shapes mirror the `projects` entity contract
 * (entities/project.ts `projectSchema`; createdAt is a plain String in the DB).
 */
import type { Project } from "@/entities/project";

let nextId = 900;

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: nextId++,
    name: "Projeto de teste",
    description: null,
    createdAt: new Date().toISOString(),
    createdBy: 2,
    leaderId: null,
    status: "active",
    links: null,
    ...overrides,
  };
}

/** Canonical project list used by board component tests and E2E MSW. */
export function boardProjectsFixture(): Project[] {
  return [
    makeProject({ id: 1, name: "Sensores de bancada", leaderId: 2 }),
    makeProject({ id: 2, name: "Análise de dados lab", leaderId: 3 }),
  ];
}
