/**
 * lib/constants/report-periods.ts — thin re-export of the pure period core now living in
 * `backend/domain/reporting/ReportPeriod.ts` (SPEC §4.3/§4.5, OND7-B2 — same pattern as
 * `lib/auth/rbac.ts` in OND2).
 *
 * THE PUBLIC CONTRACT IS DELIBERATELY UNCHANGED: every caller (frontend components,
 * app/api routes, the LEGACY reporting gateway) keeps importing the same names from the
 * same path. Only the origin of the implementation moved (AGENT.md §5).
 */
import {
  computeReportPeriod,
  isReportPeriod,
  listReportPeriods,
  REPORT_PERIODS,
  type ReportPeriod as DomainReportPeriod,
  type ReportPeriodWindow,
} from "@/backend/domain/reporting/ReportPeriod";

export type ReportPeriodType = DomainReportPeriod;

export const REPORT_PERIOD_TYPES: ReportPeriodType[] = REPORT_PERIODS;

export function isReportPeriodType(value: unknown): value is ReportPeriodType {
  return isReportPeriod(value);
}

/** Window shape (was an interface here; now an alias of the domain window). */
export type ReportPeriod = ReportPeriodWindow;

/** Computes the report window containing `reference` (SP-anchored). */
export function computePeriod(type: ReportPeriodType, reference: Date): ReportPeriod {
  return computeReportPeriod(type, reference);
}

/** Lists consecutive periods of `type` covering [from..to] (inclusive, by reference instants). */
export function listPeriods(type: ReportPeriodType, from: Date, to: Date): ReportPeriod[] {
  return listReportPeriods(type, from, to);
}
