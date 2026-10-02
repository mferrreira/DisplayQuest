/**
 * backend/domain — barrel of the SHARED PURE CORE (SPEC §2, RG-01, RG-07).
 *
 * Nothing in this tree may import the ORM, a framework, HTTP or an adapter; the gate enforces
 * it with rule `rg01-domain-core-no-external`. Other layers import the core THROUGH THIS BARREL,
 * never through an internal path (RG-07).
 *
 * ONDA 0 content:
 *   OND0-B2  errors/ + the pure enums (identity/UserRole, task/*, work/WorkSessionStatus,
 *            reporting/ReportPeriod)
 *   OND0-B3  identity/roles, identity/permissions, identity/has-permission
 *   OND0-B4  the pure contracts the ports exchange (task/Task, work/WorkSession+DailyLog,
 *            gamification/Badge, project/Project, lab/*, store/Purchase)
 *   OND0-B5  work/schedule (moved out of lib/work-sessions — DEC-03)
 *   plan-v3 OND1-B1  time/civil-day — calendar day in America/Sao_Paulo, shared by the award
 *                    rule and the board's display mirror (DEC-31; RG-01 forbids domain → lib)
 * Later waves add notification/ and the rich entities (behaviour, not just shape).
 */
export * from "./errors";
export * from "./identity";
export * from "./notification";
export * from "./task";
export * from "./time";
export * from "./work";
export * from "./reporting";
export * from "./gamification";
export * from "./project";
export * from "./lab";
export * from "./store";
