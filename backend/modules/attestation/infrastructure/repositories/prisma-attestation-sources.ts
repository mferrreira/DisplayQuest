import { prisma } from "@/lib/database/prisma";

import type { AttestationActivityRow } from "@/backend/domain";

import type {
  AttestationSourcesPort,
  CertificateMemberContext,
  CertificateProjectContext,
} from "../../application/ports/attestation-sources.port";

/**
 * PrismaAttestationSources — a leitura que o atestado precisa, por adaptador próprio do
 * módulo (RG-04, V5-10a; mesmo desenho do `PrismaTechnicalReportSources`).
 *
 * O membro pode ser a linha de `project_members` OU o líder sem membership (DEC-167: o
 * líder entra explícito no gate; para o atestado ele também é pessoa do projeto — nesse
 * caso os campos do vínculo saem nulos). As atividades do corpo são as que CRUZAM o mês
 * de referência (comparação lexicográfica de `AAAA-MM`, DEC-156), na ordem da grade.
 */
export class PrismaAttestationSources implements AttestationSourcesPort {
  async findProjectContext(
    projectId: number,
    actorId: number | null,
  ): Promise<CertificateProjectContext | null> {
    const project = await prisma.projects.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        editalNumber: true,
        proppiNumber: true,
        leaderId: true,
      },
    });
    if (!project) return null;

    if (actorId === null) {
      return {
        projectId: project.id,
        name: project.name,
        editalNumber: project.editalNumber,
        proppiNumber: project.proppiNumber,
        leaderId: project.leaderId,
        actorMembershipRoles: null,
      };
    }

    const membership = await prisma.project_members.findUnique({
      where: { projectId_userId: { projectId, userId: actorId } },
      select: { roles: true },
    });
    return {
      projectId: project.id,
      name: project.name,
      editalNumber: project.editalNumber,
      proppiNumber: project.proppiNumber,
      leaderId: project.leaderId,
      actorMembershipRoles: membership ? membership.roles : null,
    };
  }

  async findMemberContext(projectId: number, userId: number): Promise<CertificateMemberContext | null> {
    const membership = await prisma.project_members.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { categoria: true, cargaHoraria: true },
    });

    if (!membership) {
      // Sem vínculo, só o líder é pessoa do projeto (DEC-167).
      const leader = await prisma.projects.findUnique({
        where: { id: projectId },
        select: { leaderId: true },
      });
      if (!leader || leader.leaderId !== userId) return null;
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        cpf: true,
        registrationNumber: true,
        level: true,
        scholarshipType: true,
        fundingAgency: true,
        fundingAgencyOther: true,
      },
    });
    if (!user) return null;

    return {
      userId: user.id,
      name: user.name,
      cpf: user.cpf,
      registrationNumber: user.registrationNumber,
      level: user.level,
      scholarshipType: user.scholarshipType,
      fundingAgency: user.fundingAgency,
      fundingAgencyOther: user.fundingAgencyOther,
      categoria: membership ? membership.categoria : null,
      cargaHoraria: membership ? membership.cargaHoraria : null,
    };
  }

  async listScheduleActivities(projectId: number): Promise<AttestationActivityRow[]> {
    const activities = await prisma.project_activities.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
      select: { description: true, firstMonth: true, lastMonth: true, status: true },
    });
    return activities.map((activity) => ({
      description: activity.description,
      firstMonth: activity.firstMonth,
      lastMonth: activity.lastMonth,
      status: activity.status,
    }));
  }

  async listCompletedSessionLogs(projectId: number, userId: number, month: string) {
    const start = new Date(`${month}-01T00:00:00.000Z`);
    const [year, rawMonth] = month.split("-").map(Number);
    const end = new Date(Date.UTC(year, rawMonth, 1));
    const sessions = await prisma.work_sessions.findMany({
      where: {
        projectId,
        userId,
        status: "completed",
        endTime: { gte: start, lt: end },
      },
      orderBy: [{ endTime: "asc" }, { id: "asc" }],
      select: {
        activity: true,
        endTime: true,
        dailyLog: { select: { note: true } },
      },
    });
    return sessions.flatMap((session) => session.endTime ? [{
      activity: session.activity,
      note: session.dailyLog?.note ?? null,
      endTime: session.endTime.toISOString(),
    }] : []);
  }
}
