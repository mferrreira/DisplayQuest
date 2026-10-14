import { GenerateCertificateUseCase } from "./application/use-cases/generate-certificate.use-case";
import { GetCertificateFileUseCase } from "./application/use-cases/get-certificate-file.use-case";
import { ListCertificatesUseCase } from "./application/use-cases/list-certificates.use-case";
import { NotifyCertificateReminderUseCase } from "./application/use-cases/notify-certificate-reminder.use-case";
import type { CertificatesRepository } from "./application/ports/certificates.repository";
import type { AttestationSourcesPort } from "./application/ports/attestation-sources.port";
import type { AttestationPdfPort } from "./application/ports/attestation-pdf.port";
import type { CertificateReminderScanPort } from "./application/ports/certificate-reminder-scan.port";
import type { CertificateReminderNotifierPort } from "./application/ports/certificate-reminder-notifier.port";
import { PrismaCertificatesRepository } from "./infrastructure/repositories/prisma-certificates.repository";
import { PrismaAttestationSources } from "./infrastructure/repositories/prisma-attestation-sources";
import { PrismaCertificateReminderScanPort } from "./infrastructure/repositories/prisma-certificate-reminder-scan";
import { AcroFormAttestationAdapter } from "./infrastructure/adapters/acroform-attestation.adapter";
import { createNoOpCertificateReminderNotifier } from "./infrastructure/adapters/notifications-certificate-reminder";

/**
 * Módulo `attestation` (V5-10a, DEC-75/130/170/171) — atestados de frequência mensais.
 *
 * Quatro use cases: gerar (monta campos, adaptador devolve bytes, registro upsert — a rota
 * move o byte ao bucket, DEC-133), listar (leitura aberta do autenticado, só metadado),
 * gatear o download do arquivo (self OU gestão, DEC-171) e o lembrete mensal do cron
 * (V5-10b, DEC-72 — sem rota de propósito, DEC-54). Portas injetáveis por factory
 * (padrão da casa): a suíte de unit roda sem Prisma e sem bucket no ar.
 */
export class AttestationModule {
  constructor(
    private readonly generateCertificateUseCase: GenerateCertificateUseCase,
    private readonly listCertificatesUseCase: ListCertificatesUseCase,
    private readonly getCertificateFileUseCase: GetCertificateFileUseCase,
    private readonly notifyCertificateReminderUseCase: NotifyCertificateReminderUseCase,
  ) {}

  generateCertificate(command: Parameters<GenerateCertificateUseCase["execute"]>[0]) {
    return this.generateCertificateUseCase.execute(command);
  }

  listCertificates(command: Parameters<ListCertificatesUseCase["execute"]>[0]) {
    return this.listCertificatesUseCase.execute(command);
  }

  getCertificateFile(command: Parameters<GetCertificateFileUseCase["execute"]>[0]) {
    return this.getCertificateFileUseCase.execute(command);
  }

  notifyCertificateReminder(command: Parameters<NotifyCertificateReminderUseCase["execute"]>[0]) {
    return this.notifyCertificateReminderUseCase.execute(command);
  }
}

export interface AttestationModulePorts {
  certificates?: CertificatesRepository;
  sources?: AttestationSourcesPort;
  pdf?: AttestationPdfPort;
  reminderScan?: CertificateReminderScanPort;
  reminderNotifier?: CertificateReminderNotifierPort;
}

export interface AttestationModuleFactoryOptions {
  ports?: AttestationModulePorts
}

export function createAttestationModule(options: AttestationModuleFactoryOptions = {}) {
  const certificates = options.ports?.certificates ?? new PrismaCertificatesRepository();
  const sources = options.ports?.sources ?? new PrismaAttestationSources();
  const pdf = options.ports?.pdf ?? new AcroFormAttestationAdapter();
  const reminderScan = options.ports?.reminderScan ?? new PrismaCertificateReminderScanPort();
  const reminderNotifier = options.ports?.reminderNotifier ?? createNoOpCertificateReminderNotifier();

  return new AttestationModule(
    new GenerateCertificateUseCase({ sources, pdf, repository: certificates }),
    new ListCertificatesUseCase({ sources, repository: certificates }),
    new GetCertificateFileUseCase({ sources, repository: certificates }),
    new NotifyCertificateReminderUseCase({ scan: reminderScan, notifier: reminderNotifier }),
  );
}
