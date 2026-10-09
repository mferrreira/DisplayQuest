// @vitest-environment node
/**
 * ONDA 0 / batch 0.2 — DC2: the domain enums mirror the persisted values, and the pure core
 * stays free of the ORM.
 *
 * The reference values are LITERAL arrays on purpose (PLAN §5 batch 0.2: "smoke, nao acoplado
 * a prisma, so um array literal de referencia"). Reading them from `@prisma/client` would make
 * the test that guards AC-00-01 depend on the very thing AC-00-01 forbids.
 *
 * The last describe() block is the machine version of the AGENTS.md grep: it reads the source
 * text of backend/domain/** and asserts no Prisma import appears. That is allowed here — the
 * test reads files, it does not import the ORM.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REPORT_PERIODS, ReportPeriod, isReportPeriod } from "@/backend/domain/reporting";
import { TASK_STATUSES, TASK_VISIBILITIES, TaskStatus, TaskVisibility, isTaskStatus, isTaskVisibility } from "@/backend/domain/task";
import { PROFILE_VISIBILITIES, ProfileVisibility, isProfileVisibility, USER_ROLES, UserRole, isUserRole } from "@/backend/domain/identity";
import { WORK_SESSION_STATUSES, WorkSessionStatus, isWorkSessionStatus } from "@/backend/domain/work";

/** Mirrors prisma/schema.prisma `enum UserRole` (:371). */
const SCHEMA_USER_ROLES = [
  "COORDENADOR",
  "GERENTE",
  "LABORATORISTA",
  "PESQUISADOR",
  "GERENTE_PROJETO",
  "COLABORADOR",
  "VOLUNTARIO",
];

/**
 * Reference for the String columns, taken from what the backend writes today
 * (backend/models/Task.ts, backend/modules/work-execution/infrastructure/
 * work-session-service.gateway.ts, entities/report.ts).
 */
const SCHEMA_TASK_STATUSES = ["to-do", "in-progress", "in-review", "adjust", "done"];
const SCHEMA_TASK_VISIBILITIES = ["public", "delegated", "private"];
const SCHEMA_WORK_SESSION_STATUSES = ["active", "paused", "completed"];
const SCHEMA_REPORT_PERIODS = ["weekly", "biweekly", "monthly", "semiannual", "annual"];
/** Mirrors prisma/schema.prisma `enum ProfileVisibility` (:381). */
const SCHEMA_PROFILE_VISIBILITIES = ["public", "members_only", "private"];

describe("domain enums mirror the persisted values", () => {
  it("UserRole == enum UserRole do schema", () => {
    expect(USER_ROLES).toEqual(SCHEMA_USER_ROLES);
  });

  it("TaskStatus == valores de tasks.status", () => {
    expect(TASK_STATUSES).toEqual(SCHEMA_TASK_STATUSES);
  });

  it("TaskVisibility == valores de tasks.taskVisibility", () => {
    expect(TASK_VISIBILITIES).toEqual(SCHEMA_TASK_VISIBILITIES);
  });

  it("WorkSessionStatus == valores de work_sessions.status", () => {
    expect(WORK_SESSION_STATUSES).toEqual(SCHEMA_WORK_SESSION_STATUSES);
  });

  it("ReportPeriod == valores de hours_reports.periodType", () => {
    expect(REPORT_PERIODS).toEqual(SCHEMA_REPORT_PERIODS);
  });

  it("ProfileVisibility == enum ProfileVisibility do schema", () => {
    expect(PROFILE_VISIBILITIES).toEqual(SCHEMA_PROFILE_VISIBILITIES);
    expect(isProfileVisibility("members_only")).toBe(true);
    expect(isProfileVisibility("publico")).toBe(false);
    const visibility: ProfileVisibility = ProfileVisibility.PRIVATE;
    expect(visibility).toBe("private");
  });

  it("guards accept the mirrored values and reject everything else", () => {
    expect(isUserRole("COORDENADOR")).toBe(true);
    expect(isUserRole("ADMIN")).toBe(false);
    expect(isTaskStatus("in-progress")).toBe(true);
    // legacy spellings are wire-tolerance, not domain values (entities/task.ts wireTaskStatus)
    expect(isTaskStatus("in_progress")).toBe(false);
    expect(isTaskStatus("completed")).toBe(false);
    expect(isTaskVisibility("delegated")).toBe(true);
    expect(isTaskVisibility("shared")).toBe(false);
    expect(isWorkSessionStatus("paused")).toBe(true);
    expect(isWorkSessionStatus("expired")).toBe(false);
    expect(isReportPeriod("weekly")).toBe(true);
    expect(isReportPeriod("daily")).toBe(false);
  });

  it("the enum objects and the union types are usable as values (shape parity with @prisma/client)", () => {
    const role: UserRole = UserRole.COORDENADOR;
    const status: TaskStatus = TaskStatus.IN_PROGRESS;
    const visibility: TaskVisibility = TaskVisibility.DELEGATED;
    const sessionStatus: WorkSessionStatus = WorkSessionStatus.PAUSED;
    const period: ReportPeriod = ReportPeriod.WEEKLY;
    expect([role, status, visibility, sessionStatus, period]).toEqual([
      "COORDENADOR",
      "in-progress",
      "delegated",
      "paused",
      "weekly",
    ]);
  });
});

describe("backend/domain is pure (AC-00-01 / AC-00-10, machine version of the grep)", () => {
  const DOMAIN_ROOT = join(process.cwd(), "backend", "domain");

  function collectTsFiles(dir: string): string[] {
    // node:fs is used as a reader here, never as a mocked seam (AGENTS.md gotcha).
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...collectTsFiles(full));
      else if (entry.name.endsWith(".ts")) out.push(full);
    }
    return out;
  }

  /**
   * Comments are stripped before matching: this file's own documentation quotes
   * `@prisma/client` and `backend/models/...` while explaining why the core must NOT import
   * them, and a naive text match would report the explanation as a violation.
   */
  function stripComments(text: string): string {
    return text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/[^\n]*/g, "$1");
  }

  const files = collectTsFiles(DOMAIN_ROOT);

  it("the core has files (a vacuous green is not a green)", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it("no file imports @prisma/client or the prisma seam", () => {
    const offenders = files
      .map((file) => ({ file, text: stripComments(readFileSync(file, "utf8")) }))
      .filter(({ text }) =>
        /from\s+"(?:@prisma\/client(?:\/[^"]*)?|@\/lib\/database\/prisma)/.test(text) ||
        /new\s+PrismaClient/.test(text),
      )
      .map(({ file }) => file.replace(DOMAIN_ROOT, "backend/domain"));
    expect(offenders).toEqual([]);
  });

  it("no file imports lib/, app/, next, repositories, models or another module", () => {
    const offenders = files
      .map((file) => ({ file, text: stripComments(readFileSync(file, "utf8")) }))
      .filter(({ text }) =>
        /from\s+"(?:@\/lib\/|@\/app\/|@\/backend\/(?:repositories|composition|modules|models)|next|next\/[^"]*|@\/(?:contexts|components|features|hooks|entities|shared))/.test(
          text,
        ),
      )
      .map(({ file }) => file.replace(DOMAIN_ROOT, "backend/domain"));
    expect(offenders).toEqual([]);
  });
});
