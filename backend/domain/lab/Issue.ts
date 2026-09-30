/**
 * Issue — pure domain contract of the lab aggregate (SPEC §4.5).
 *
 * Type-only mirror of `backend/models/Issue.ts`, INCLUDING `toJSON()`: batch 0.4 measured that
 * the route adapters read the ports' return values as `x.toJSON()`, so a data-only interface
 * would not be "mesma forma" (AGENT.md §5). `issues.status` is a real Prisma enum whose values
 * are these four literals; the model already types it as this literal union.
 */
export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";
export type IssuePriority = "low" | "medium" | "high" | "urgent";

export interface IIssue {
  id?: number;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  category?: string | null;
  reporterId: number;
  assigneeId?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
  resolvedAt?: Date | null;
}

export interface Issue extends IIssue {
  toJSON(): any;
}
