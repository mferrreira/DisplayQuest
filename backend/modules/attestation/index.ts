import { GenerateCertificateUseCase } from "./application/use-cases/generate-certificate.use-case";
import { GetCertificateFileUseCase } from "./application/use-cases/get-certificate-file.use-case";
import { ListCertificatesUseCase } from "./application/use-cases/list-certificates.use-case";
import type { CertificatesRepository } from "./application/ports/certificates.repository";
import type { AttestationSourcesPort } from "./application/ports/attestation-sources.port";
import type { AttestationPdfPort } from "./application/ports/attestation-pdf.port";
import { PrismaCertificatesRepository } from "./infrastructure/repositories/prisma-certificates.repository";
import { PrismaAttestationSources } from "./infrastructure/repositories/prisma-attestation-sources";
import { AcroFormAttestationAdapter } from "./infrastructure/adapters/acroform-attestation.adapter";

/**
 * Módulo `attestation` (V5-10a, DEC-75/130/170/171) — atestados de frequência mensais.
 *
 * Três use cases: gerar (monta campos, adaptador devolve bytes, registro upsert — a rota
 * move o byte ao bucket, DEC-133), listar (leitura aberta do autenticado, só metadado) e
 * gatear o download do arquivo (self OU gestão, DEC-171). Portas injetáveis por factory
 * (padrão da casa): a suíte de unit roda sem Prisma e sem bucket no ar.
 */
export class AttestationModule {
  constructor(
    private readonly generateCertificateUseCase: GenerateCertificateUseCase,
    private readonly listCertificatesUseCase: ListCertificatesUseCase,
    private readonly getCertificateFileUseCase: GetCertificateFileUseCase,
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
}

export interface AttestationModulePorts {
  certificates?: CertificatesRepository;
  sources?: AttestationSourcesPort;
  pdf?: AttestationPdfPort;
}

export interface AttestationModuleFactoryOptions {
  ports?: AttestationModulePorts
}

export function createAttestationModule(options: AttestationModuleFactoryOptions = {}) {
  const certificates = options.ports?.certificates ?? new PrismaCertificatesRepository();
  const sources = options.ports?.sources ?? new PrismaAttestationSources();
  const pdf = options.ports?.pdf ?? new AcroFormAttestationAdapter();

  return new AttestationModule(
    new GenerateCertificateUseCase({ sources, pdf, repository: certificates }),
    new ListCertificatesUseCase({ sources, repository: certificates }),
    new GetCertificateFileUseCase({ sources, repository: certificates }),
  );
}
