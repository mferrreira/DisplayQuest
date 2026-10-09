/** LabNotice — pure domain contract (type-only mirror of `backend/models/LabNotice.ts`). */
export interface ILabNotice {
  id?: number;
  userId: number;
  userName: string;
  note: string;
  createdAt?: Date;
}

export interface LabNotice extends ILabNotice {
  toJSON(): any;
}
