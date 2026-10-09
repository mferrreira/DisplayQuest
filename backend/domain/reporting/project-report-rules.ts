/**
 * OND7-B2 — pure project-report rules (SPEC §4.5, DEC-20 pattern).
 *
 * The ACL/validation/label rules of the "Project Reports (4b)" section of
 * `PrismaReportingGateway` (gateway:671-1011), extracted VERBATIM (golden OND7-B1). The
 * DB lookups (project exists? leader?) stay in the adapter; the DECISIONS are here.
 *
 * Frozen quirks (golden OND7-B1):
 *   - QUIRK-7J: membership does NOT grant report access — only MANAGE_USERS (COORDENADOR/
 *     GERENTE) or leaderId. A leader WITHOUT any led project is denied even with no filter.
 *   - QUIRK-7G: delete is MANAGE_USERS-only (the author cannot delete their own report).
 *   - QUIRK-7E: the read-model label for `weekly` uses the date-fns LOCAL format
 *     `Semana dd/MM–dd/MM`, while the notification uses the SP-anchored computePeriod label
 *     `Semana de dd/MM a dd/MM`.
 *   - QUIRK-7M: listProjectReports `from`/`to` collide on the same `periodStart` key — `to`
 *     (lte) overwrites `from` (gte). The use case reproduces this collision verbatim.
 *   - Notification recipients: ACTIVE users with COORDENADOR or GERENTE, excluding the
 *     author; failure is swallowed (console.error) by the publisher port caller.
 */
import { format } from "date-fns"
import { hasPermission } from "../identity"
import { computeReportPeriod, type ReportPeriod } from "./ReportPeriod"

/** isManagementRole (gateway:671-673): hasPermission(actorRoles, "MANAGE_USERS"). */
export function canManageProjectReports(actorRoles: string[]): boolean {
  return hasPermission(actorRoles, "MANAGE_USERS")
}

/** Roles the submission notification targets (gateway:742). */
export const REPORT_NOTIFICATION_ROLES: string[] = ["COORDENADOR", "GERENTE"]

/** Event emitted on FIRST submission only (gateway:750-757). */
export const REPORT_SUBMISSION_EVENT = {
  eventType: "PROJECT_REPORT_SUBMITTED",
  title: "Novo relatório de projeto",
} as const

/** Notification message: `${period.label} · ${projectName}` (computePeriod label). */
export function reportSubmissionMessage(periodLabel: string, projectName: string): string {
  return `${periodLabel} · ${projectName}`
}

export type ReportAccessDecision = "ok" | "denied"

/** createProjectReport access (gateway:683-689): project -> management -> leader. */
export function decideReportCreateAccess(
  projectExists: boolean,
  isManagement: boolean,
  isLeader: boolean,
): "ok" | "project_not_found" | "denied" {
  if (!projectExists) return "project_not_found"
  if (isManagement) return "ok"
  if (isLeader) return "ok"
  return "denied"
}

/** getProjectReport/aggregate view access (gateway:691-695). */
export function decideReportViewAccess(isManagement: boolean, isLeader: boolean): ReportAccessDecision {
  if (isManagement) return "ok"
  if (isLeader) return "ok"
  return "denied"
}

/** updateProjectReport/registerReportAttachment edit access (gateway:834-837, 976-979). */
export function decideReportEditAccess(isManagement: boolean, isAuthor: boolean): ReportAccessDecision {
  if (isManagement) return "ok"
  if (isAuthor) return "ok"
  return "denied"
}

/** deleteProjectReport access (gateway:852-854): MANAGE_USERS only (QUIRK-7G). */
export function decideReportDeleteAccess(isManagement: boolean): ReportAccessDecision {
  return isManagement ? "ok" : "denied"
}

/** deleteReportAttachment access (gateway:997-1000): MANAGE_USERS or the uploader. */
export function decideAttachmentDeleteAccess(isManagement: boolean, isUploader: boolean): ReportAccessDecision {
  if (isManagement) return "ok"
  if (isUploader) return "ok"
  return "denied"
}

/**
 * listProjectReports project filter (gateway:881-895). Non-manager: led projects only; a
 * projectId outside the led set is denied; an EMPTY led set is denied even without a filter
 * (QUIRK-7J).
 */
export function decideReportListAccess(
  isManagement: boolean,
  projectId: number | undefined,
  ledProjectIds: readonly number[],
): { allowed: true; projectFilter: number[] | undefined } | { allowed: false } {
  if (isManagement) {
    return { allowed: true, projectFilter: projectId ? [projectId] : undefined }
  }
  if (projectId !== undefined && !ledProjectIds.includes(projectId)) {
    return { allowed: false }
  }
  if (ledProjectIds.length === 0) {
    return { allowed: false }
  }
  return { allowed: true, projectFilter: [...ledProjectIds] }
}

/**
 * Read-model periodLabel (buildProjectReportReadModel, gateway:715-717). QUIRK-7E: `weekly`
 * uses the date-fns LOCAL format; the other types reuse the SP-anchored computePeriod label.
 */
export function projectReportPeriodLabel(
  periodType: ReportPeriod,
  periodStart: Date,
  periodEnd: Date,
): string {
  return periodType === "weekly"
    ? `Semana ${format(periodStart, "dd/MM")}–${format(periodEnd, "dd/MM")}`
    : computeReportPeriod(periodType, periodStart).label
}

/** createProjectReport content rule (gateway:768-770). Update does NOT validate (QUIRK-7F). */
export function hasValidReportContent(content: string | null | undefined): boolean {
  return Boolean(content && content.trim().length > 0)
}
