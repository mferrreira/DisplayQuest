/**
 * LabResponsibility — pure domain contract (type-only mirror of `backend/models/LabResponsibility.ts`).
 * Field optionality mirrors the CLASS (pausedAt/totalPausedMs are always set by its constructor),
 * not the `ILabResponsibility` input shape — that is the shape the ports exchange. `toJSON()` is
 * part of the contract for the reason measured in batch 0.4 (routes read ports as `x.toJSON()`).
 * The anti-farm / scheduled-pause rules move here as behaviour in OND3-B2.
 */
export interface ILabResponsibility {
  id?: number;
  userId: number;
  userName: string;
  startTime: Date;
  endTime?: Date | null;
  pausedAt?: Date | null;
  totalPausedMs?: number;
  notes?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface LabResponsibility extends ILabResponsibility {
  pausedAt: Date | null;
  totalPausedMs: number;
  toJSON(): any;
}
