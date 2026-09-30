import type { ReportAttachmentsRepository } from "@/backend/modules/reporting/application/ports/report-attachments.repository"
import type { ReportStoragePort } from "@/backend/modules/reporting/application/ports/report-storage.port"

/** OND7-B3 — frozen from sweepStaleReportUploads (gateway:1005-1011): collect the referenced
 * storedPaths and delegate to the storage seam. */
export class SweepStaleReportUploadsUseCase {
  constructor(
    private readonly attachments: ReportAttachmentsRepository,
    private readonly storage: ReportStoragePort,
  ) {}

  async execute(maxAgeMs?: number): Promise<number> {
    const referenced = await this.attachments.findAllStoredPaths()
    return await this.storage.sweepStale(referenced, maxAgeMs)
  }
}
