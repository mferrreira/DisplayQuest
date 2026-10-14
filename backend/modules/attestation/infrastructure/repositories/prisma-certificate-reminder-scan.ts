import { prisma } from "@/lib/database/prisma";
import type {
  CertificateReminderProject,
  CertificateReminderScanPort,
} from "@/backend/modules/attestation/application/ports/certificate-reminder-scan.port";

/**
 * PrismaCertificateReminderScanPort — leitura do lembrete mensal (V5-10b, DEC-72).
 *
 * Projeto com pelo menos um membro `situacao = ATIVO` no vínculo (DEC-149: sair apaga a
 * linha; horas ficam em work_sessions). Gestores globais só ATIVOS (DEC-55: suspenso não
 * recebe notificação) — mesma consulta medida do scan de atraso.
 */
export class PrismaCertificateReminderScanPort implements CertificateReminderScanPort {
  async listProjectsForReminder(): Promise<CertificateReminderProject[]> {
    const rows = await prisma.projects.findMany({
      where: { members: { some: { situacao: "ATIVO" } } },
      select: { id: true, name: true, leaderId: true },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => ({
      projectId: row.id,
      projectName: row.name,
      leaderId: row.leaderId ?? null,
    }));
  }

  async listGlobalManagerUserIds(): Promise<number[]> {
    const rows = await prisma.users.findMany({
      where: {
        status: "active",
        roles: { hasSome: ["COORDENADOR", "GERENTE"] },
      },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    return rows.map((row) => row.id);
  }
}

export function createPrismaCertificateReminderScanPort(): CertificateReminderScanPort {
  return new PrismaCertificateReminderScanPort();
}
