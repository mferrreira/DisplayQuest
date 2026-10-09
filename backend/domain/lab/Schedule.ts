/**
 * LaboratorySchedule / UserSchedule — pure domain contracts (SPEC §4.5).
 * Type-only mirrors of `backend/models/LaboratorySchedule.ts` and `backend/models/UserSchedule.ts`,
 * `toJSON()` included for the reason recorded in batch 0.4 (routes read ports as `x.toJSON()`).
 * `dayOfWeek` is 0..6 in both; not re-based here — that would be a behaviour change.
 */
export interface ILaboratorySchedule {
  id?: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LaboratorySchedule extends ILaboratorySchedule {
  toJSON(): any;
}

export interface IUserSchedule {
  id?: number;
  userId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  createdAt?: Date;
}

export interface UserSchedule extends IUserSchedule {
  toJSON(): any;
}
