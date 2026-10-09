import type { LabNotice } from "@/backend/domain"

/**
 * OND8-B3 — porta fina de lab notices (R2). A persistência em `history`
 * (entityType LAB_NOTICE / action CREATE / entityId 0 — QUIRK-8L1) é DETALHE DO ADAPTER;
 * a porta expõe avisos.
 */
export interface LabNoticeRepository {
  findAllNotices(): Promise<LabNotice[]>
  findNoticeById(id: number): Promise<LabNotice | null>
  createNotice(input: { performedBy: number; description: string; metadata: { userName: string } }): Promise<LabNotice>
  deleteNotice(id: number): Promise<void>
}
