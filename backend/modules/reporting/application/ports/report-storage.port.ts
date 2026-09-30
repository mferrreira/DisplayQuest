/**
 * OND7-B3 — port over the report-file storage seam (lib/storage/report-uploads).
 * Same seam the A11 mitigation established: routes/adapters never touch `node:fs` directly
 * (AGENTS.md gotcha — vitest mocks the lib, not the builtin).
 */
export interface ReportStoragePort {
  removeFile(storedPath: string): Promise<void>
  sweepStale(referencedStoredPaths: string[], maxAgeMs?: number): Promise<number>
}
