import type { DailyLog } from "@/backend/domain";

/**
 * DailyLogRepositoryPort (OND3-B2, R2) — persistence seam of the daily-log aggregate.
 *
 * Semantics frozen by the golden matrix (OND3-B1): `findByDate` uses LOCAL day boundaries
 * (startOfDay..endOfDay of the given date), reads keep the repository's natural order,
 * `findUserById` is the existence/name lookup used before creating a manual log.
 */
export interface NewDailyLog {
  userId: number;
  projectId?: number | null;
  date: Date;
  note?: string | null;
  workSessionId?: number | null;
}

export interface DailyLogRepositoryPort {
  findById(id: number): Promise<DailyLog | null>;
  findByUserId(userId: number): Promise<DailyLog[]>;
  findByProjectId(projectId: number): Promise<DailyLog[]>;
  findByWorkSessionId(workSessionId: number): Promise<DailyLog | null>;
  findByDate(userId: number, date: Date): Promise<DailyLog[]>;
  findAll(): Promise<DailyLog[]>;
  create(dailyLog: NewDailyLog): Promise<DailyLog>;
  update(dailyLog: DailyLog & { id: number }): Promise<DailyLog>;
  findUserById(userId: number): Promise<{ id: number; name: string } | null>;
}
