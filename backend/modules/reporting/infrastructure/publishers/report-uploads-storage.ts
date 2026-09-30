import { removeStoredReportFile, sweepStaleReportUploads } from "@/lib/storage/report-uploads"
import type { ReportStoragePort } from "@/backend/modules/reporting/application/ports/report-storage.port"

/**
 * OND7-B3 — adapter over the A11 storage seam (lib/storage/report-uploads). Same seam the
 * legacy gateway used; routes/tests never touch node:fs (AGENTS.md gotcha).
 */
export class ReportUploadsStorage implements ReportStoragePort {
  async removeFile(storedPath: string): Promise<void> {
    await removeStoredReportFile(storedPath)
  }

  async sweepStale(referencedStoredPaths: string[], maxAgeMs?: number): Promise<number> {
    return await sweepStaleReportUploads(referencedStoredPaths, maxAgeMs)
  }
}
