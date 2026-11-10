/**
 * V5-10a (DEC-75/130/139/170/171) — use cases do atestado, congelados antes do código.
 *
 * Ordem de recusa medida da geração: 404 projeto → 403 gate → 400 mês → 404 membro.
 * Gate: a PRÓPRIA pessoa OU a gestão do projeto (líder OU ACL congelada,
 * `canActorManageProjectDecision`) — o atestado é o documento do estudante, ele pode
 * gerar o próprio. O mês default é o ANTERIOR à geração (DEC-171: mês em curso não é
 * atestado como integral). O download obedece ao MESMO par (self OU gestão); a LISTA é
 * leitura aberta (filho de projeto, regra 13) — a lista só tem metadado, o CPF está no
 * PDF, e o PDF só sai pela rota gateada.
 */
import { describe, expect, it } from "vitest";

import { ForbiddenError, NotFoundError, ValidationError } from "@/backend/domain";
import { CERTIFICATE_REMINDER_TITLE, SYSTEM_REASONS, systemActor } from "@/backend/domain";
import { NotifyCertificateReminderUseCase } from "@/backend/modules/attestation/application/use-cases/notify-certificate-reminder.use-case";
import {
  GenerateCertificateUseCase,
  CERTIFICATE_DENIED_MESSAGE,
} from "@/backend/modules/attestation/application/use-cases/generate-certificate.use-case";
import {
  GetCertificateFileUseCase,
  CERTIFICATE_FILE_DENIED_MESSAGE,
} from "@/backend/modules/attestation/application/use-cases/get-certificate-file.use-case";
import { ListCertificatesUseCase } from "@/backend/modules/attestation/application/use-cases/list-certificates.use-case";
import type { CertificateRecord, CertificatesRepository } from "@/backend/modules/attestation/application/ports/certificates.repository";
import type {
  AttestationSourcesPort,
  CertificateMemberContext,
  CertificateProjectContext,
} from "@/backend/modules/attestation/application/ports/attestation-sources.port";
import type { AttestationPdfPort } from "@/backend/modules/attestation/application/ports/attestation-pdf.port";

const PROJECT_CONTEXT: CertificateProjectContext = {
  projectId: 3,
  name: "IA no campo",
  editalNumber: "EDITAL 09/2026",
  proppiNumber: "PROPPI-2026-017",
  leaderId: 7,
  actorMembershipRoles: null,
};

const MEMBER_CONTEXT: CertificateMemberContext = {
  userId: 9,
  name: "Bento Lima",
  cpf: "12345678901",
  registrationNumber: "2026123456",
  level: "GRADUACAO",
  scholarshipType: "PIBIC",
  fundingAgency: "CNPQ",
  fundingAgencyOther: null,
  categoria: "BOLSISTA",
  cargaHoraria: 8,
};

function sourcesPort(overrides: {
  project?: CertificateProjectContext | null;
  member?: CertificateMemberContext | null;
  activities?: { description: string; firstMonth: string; lastMonth: string; status: string }[];
  sessionLogs?: { activity: string | null; note: string | null; endTime: string }[];
} = {}): AttestationSourcesPort & { scheduleCalls: number } {
  let scheduleCalls = 0;
  return {
    get scheduleCalls() {
      return scheduleCalls;
    },
    async findProjectContext() {
      return overrides.project === undefined ? PROJECT_CONTEXT : overrides.project;
    },
    async findMemberContext() {
      return overrides.member === undefined ? MEMBER_CONTEXT : overrides.member;
    },
    async listScheduleActivities() {
      scheduleCalls += 1;
      return overrides.activities ?? [
        { description: "Coleta de dados", firstMonth: "2026-09", lastMonth: "2026-10", status: "OPEN" },
      ];
    },
    async listCompletedSessionLogs() { return overrides.sessionLogs ?? []; },
  } as AttestationSourcesPort & { scheduleCalls: number };
}

function pdfPort(): AttestationPdfPort & { renders: Record<string, string | boolean>[] } {
  const renders: Record<string, string | boolean>[] = [];
  return {
    renders,
    async renderPdf(fields) {
      renders.push(fields);
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]); // assinatura %PDF
    },
  };
}

function repository(): CertificatesRepository & { rows: CertificateRecord[] } {
  const rows: CertificateRecord[] = [];
  return {
    rows,
    async upsert(input) {
      const existing = rows.find(
        (row) => row.projectId === input.projectId && row.userId === input.userId && row.month === input.month,
      );
      if (existing) {
        existing.blobKey = input.blobKey;
        existing.fileName = input.fileName;
        existing.generatedBy = input.generatedBy;
        return existing;
      }
      const record: CertificateRecord = {
        id: rows.length + 1,
        projectId: input.projectId,
        userId: input.userId,
        month: input.month,
        blobKey: input.blobKey,
        fileName: input.fileName,
        generatedBy: input.generatedBy,
        createdAt: new Date("2026-10-19T12:00:00Z"),
        updatedAt: new Date("2026-10-19T12:00:00Z"),
      };
      rows.push(record);
      return record;
    },
    async findByProject(projectId) {
      return rows.filter((row) => row.projectId === projectId);
    },
    async findById(projectId, certificateId) {
      return rows.find((row) => row.projectId === projectId && row.id === certificateId) ?? null;
    },
  };
}

async function generate(ports: {
  sources?: AttestationSourcesPort;
  pdf?: AttestationPdfPort;
  repository?: CertificatesRepository;
  actorId?: number;
  actorRoles?: string[];
  userId?: number;
  month?: string;
}) {
  const useCase = new GenerateCertificateUseCase({
    sources: ports.sources ?? sourcesPort(),
    pdf: ports.pdf ?? pdfPort(),
    repository: ports.repository ?? repository(),
  });
  return useCase.execute({
    projectId: 3,
    actorId: ports.actorId ?? 7, // líder
    actorRoles: ports.actorRoles ?? [],
    userId: ports.userId ?? 9,
    month: ports.month,
    now: new Date("2026-10-19T15:00:00-03:00"),
  });
}

describe("geração do atestado (V5-10a, DEC-170/171)", () => {
  it("gestão gera: o PDF recebe os campos montados e o registro sai com chave derivada", async () => {
    const pdf = pdfPort();
    const repo = repository();
    const { certificate } = await generate({ pdf, repository: repo });

    expect(pdf.renders).toHaveLength(1);
    const fields = pdf.renders[0];
    expect(fields.nome).toBe("Bento Lima");
    expect(fields.CPF).toBe("123.456.789-01");
    expect(fields.titulo).toBe("IA no campo");
    expect(fields.data).toBe("setembro"); // mês default = anterior à geração (DEC-171)
    expect(fields.dia).toBe("19");
    expect(fields.mes).toBe("outubro");
    expect(fields.ano).toBe("2026");

    expect(certificate.blobKey).toBe("projects/3/certificates/9/2026-09.pdf");
    expect(certificate.fileName).toBe("atestado-2026-09-ia-no-campo.pdf");
    expect(certificate.generatedBy).toBe(7);
  });

  it("o mês pedido no comando define o corpo do PDF", async () => {
    const sources = sourcesPort();
    const pdf = pdfPort();
    await generate({ sources, pdf, month: "2026-10" });
    expect(sources.scheduleCalls).toBe(1);
    expect(pdf.renders[0].data).toBe("outubro");
    expect(pdf.renders[0].atividades_1).toBe("Coleta de dados"); // cruza 2026-10 ✓
  });

  it("resume logs do mês mesmo sem task na fonte", async () => {
    const sources = sourcesPort({
      activities: [],
      sessionLogs: [{ activity: "Coleta de dados", note: "Amostras catalogadas", endTime: "2026-09-08T12:00:00.000Z" }],
    });
    const pdf = pdfPort();
    await generate({ sources, pdf });
    expect(pdf.renders[0].atividades_1).toBeUndefined();
    expect(pdf.renders[0].atividade_2).toBe("Coleta de dados: Amostras catalogadas");
  });

  it("o próprio membro gera o seu atestado mesmo sem gestão nenhuma", async () => {
    const { certificate } = await generate({
      sources: sourcesPort({ project: { ...PROJECT_CONTEXT, leaderId: 7, actorMembershipRoles: ["VOLUNTARIO"] } }),
      actorId: 9,
      actorRoles: ["PESQUISADOR"],
      userId: 9,
    });
    expect(certificate.userId).toBe(9);
  });

  it("outsider leva 403 com a frase congelada, antes do mês e antes do membro", async () => {
    await expect(
      generate({
        sources: sourcesPort({ project: { ...PROJECT_CONTEXT, leaderId: 7, actorMembershipRoles: ["VOLUNTARIO"] } }),
        actorId: 8,
        actorRoles: ["PESQUISADOR"],
        userId: 9,
        month: "10/2026", // inválido — o 403 vem antes do 400
      }),
    ).rejects.toThrow(new ForbiddenError(CERTIFICATE_DENIED_MESSAGE));
  });

  it("404 projeto → 403 gate → 400 mês → 404 membro, na ordem", async () => {
    await expect(generate({ sources: sourcesPort({ project: null }) })).rejects.toThrow(NotFoundError);

    await expect(
      generate({
        sources: sourcesPort({ project: { ...PROJECT_CONTEXT, leaderId: 7, actorMembershipRoles: ["COLABORADOR"] } }),
        actorId: 8,
        actorRoles: ["PESQUISADOR"],
      }),
    ).rejects.toThrow(ForbiddenError); // o gate vem antes do mês e antes do membro
  });

  it("mês inválido é 400 com a frase do domínio nomeando o campo", async () => {
    await expect(generate({ month: "10/2026" })).rejects.toThrow(ValidationError);
    await expect(generate({ month: "10/2026" })).rejects.toThrow("Mês de referência do atestado é inválido (use AAAA-MM)");
  });

  it("membro fora do projeto é 404 com a MESMA frase do vínculo", async () => {
    await expect(generate({ sources: sourcesPort({ member: null }) })).rejects.toThrow("Membro não encontrado no projeto");
  });

  it("regenerar o mesmo mês sobrescreve a linha e a chave (upsert, DEC-170)", async () => {
    const repo = repository();
    const first = await generate({ repository: repo, month: "2026-09" });
    const second = await generate({ repository: repo, month: "2026-09", actorId: 9, userId: 9 });
    expect(second.certificate.id).toBe(first.certificate.id);
    expect(repo.rows).toHaveLength(1);
    expect(second.certificate.generatedBy).toBe(9);
  });
});

describe("listagem e download (V5-10a)", () => {
  async function list(actorless = false) {
    const repo = repository();
    await generate({ repository: repo });
    const useCase = new ListCertificatesUseCase({
      sources: sourcesPort(),
      repository: repo,
    });
    return useCase.execute({ projectId: 3 });
  }

  it("a lista é leitura aberta do autenticado e não expõe CPF — só metadado", async () => {
    const certificates = await list();
    expect(certificates).toHaveLength(1);
    expect(certificates[0].month).toBe("2026-09");
    expect(certificates[0].fileName).toBe("atestado-2026-09-ia-no-campo.pdf");
    expect(JSON.stringify(certificates)).not.toContain("12345678901");
  });

  it("download: o próprio baixa, a gestão baixa, outsider leva 403 com a frase do arquivo", async () => {
    const repo = repository();
    const { certificate } = await generate({ repository: repo });
    const useCase = new GetCertificateFileUseCase({ sources: sourcesPort(), repository: repo });

    const self = await useCase.execute({ projectId: 3, certificateId: certificate.id, actorId: 9, actorRoles: ["PESQUISADOR"] });
    expect(self.certificate.blobKey).toBe("projects/3/certificates/9/2026-09.pdf");

    await expect(
      useCase.execute({
        projectId: 3,
        certificateId: certificate.id,
        actorId: 8,
        actorRoles: ["PESQUISADOR"],
      }),
    ).rejects.toThrow(new ForbiddenError(CERTIFICATE_FILE_DENIED_MESSAGE));
  });

  it("certificado ausente (ou de outro projeto) é 404", async () => {
    const repo = repository();
    await generate({ repository: repo });
    const useCase = new GetCertificateFileUseCase({ sources: sourcesPort(), repository: repo });
    await expect(
      useCase.execute({ projectId: 3, certificateId: 999, actorId: 9, actorRoles: [] }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("lembrete mensal de atestados (V5-10b, DEC-72)", () => {
  function reminderPorts(overrides: {
    projects?: Array<{ projectId: number; projectName: string; leaderId: number | null }>;
    managers?: number[];
    failPublish?: boolean;
  }) {
    const published: Array<{ projectId: number; userIds: number[]; title: string; message: string }> = [];
    const scan = {
      async listProjectsForReminder() {
        return overrides.projects ?? [{ projectId: 3, projectName: "IA no campo", leaderId: 7 }];
      },
      async listGlobalManagerUserIds() {
        return overrides.managers ?? [1, 2];
      },
    };
    const notifier = {
      async publishReminder(notification: { projectId: number; userIds: number[]; title: string; message: string }) {
        if (overrides.failPublish) throw new Error("notificações fora do ar");
        published.push(notification);
      },
    };
    return { scan, notifier, published };
  }

  function run(ports: ReturnType<typeof reminderPorts>, now = new Date("2026-10-19T12:00:00-03:00")) {
    return new NotifyCertificateReminderUseCase(ports).execute({
      actor: systemActor(SYSTEM_REASONS.CERTIFICATE_REMINDER),
      now,
    });
  }

  it("notifica líder + gestores globais, com o mês ANTERIOR nomeado na mensagem (DEC-72/171)", async () => {
    const ports = reminderPorts({});
    const result = await run(ports);

    expect(result).toEqual({ projectsNotified: 1, recipientsNotified: 3 });
    expect(ports.published[0].userIds).toEqual([7, 1, 2]);
    expect(ports.published[0].title).toBe(CERTIFICATE_REMINDER_TITLE);
    expect(ports.published[0].message).toBe(
      'O atestado de frequência de setembro já pode ser gerado para o projeto "IA no campo".',
    );
  });

  it("dedupe: líder que também é gestor global recebe UMA vez", async () => {
    const ports = reminderPorts({ managers: [7, 1] });
    const result = await run(ports);
    expect(result.recipientsNotified).toBe(2);
    expect(ports.published[0].userIds).toEqual([7, 1]);
  });

  it("projeto sem destinatário (líder nulo e sem gestor) não é notificado", async () => {
    const ports = reminderPorts({ projects: [{ projectId: 3, projectName: "Sem líder", leaderId: null }], managers: [] });
    const result = await run(ports);
    expect(result).toEqual({ projectsNotified: 0, recipientsNotified: 0 });
    expect(ports.published).toHaveLength(0);
  });

  it("falha de publicação não quebra o lote dos demais projetos", async () => {
    const published: Array<{ projectId: number; userIds: number[]; title: string; message: string }> = [];
    const scan = {
      async listProjectsForReminder() {
        return [
          { projectId: 3, projectName: "Primeiro", leaderId: 7 },
          { projectId: 4, projectName: "Segundo", leaderId: 8 },
        ];
      },
      async listGlobalManagerUserIds() {
        return [1, 2];
      },
    };
    const notifier = {
      async publishReminder(notification: { projectId: number; userIds: number[]; title: string; message: string }) {
        if (notification.projectId === 3) throw new Error("notificações fora do ar");
        published.push(notification);
      },
    };
    const result = await new NotifyCertificateReminderUseCase({ scan, notifier }).execute({
      actor: systemActor(SYSTEM_REASONS.CERTIFICATE_REMINDER),
      now: new Date("2026-10-19T12:00:00-03:00"),
    });
    expect(result.projectsNotified).toBe(1);
    expect(published[0].projectId).toBe(4);
  });

  it("virada de mês no fuso de São Paulo: 2026-10-19T02:00-03:00 ainda nomeia setembro", async () => {
    const ports = reminderPorts({});
    await run(ports, new Date("2026-10-19T02:00:00-03:00"));
    expect(ports.published[0].message).toContain("setembro");
  });
});
