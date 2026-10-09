import type { Issue } from "@/backend/domain"
import type { NormalizedIssueCreate } from "@/backend/domain"

/** OND8-B3 — porta fina de `issues` (R2). Table-level only; filtros por coluna, sem regras. */
export interface IssueRepository {
  findById(id: number): Promise<Issue | null>
  findAll(): Promise<Issue[]>
  findByStatus(status: string): Promise<Issue[]>
  findByPriority(priority: string): Promise<Issue[]>
  findByCategory(category: string): Promise<Issue[]>
  findByReporterId(reporterId: number): Promise<Issue[]>
  findByAssigneeId(assigneeId: number): Promise<Issue[]>
  create(input: NormalizedIssueCreate): Promise<Issue>
  update(id: number, fields: Partial<NormalizedIssueCreate>): Promise<Issue>
  delete(id: number): Promise<void>
}
