/** LabEvent — pure domain contract (type-only mirror of `backend/models/LabEvent.ts`). */
export interface ILabEvent {
  id?: number;
  userId: number;
  userName: string;
  date: Date;
  note: string;
  createdAt?: Date;
}

export interface LabEvent extends ILabEvent {
  toJSON(): any;
}
