import type { AttestationSessionLogRow } from "./attestation-sources.port";

export interface AttestationSummaryPort {
  summarize(rows: AttestationSessionLogRow[]): Promise<string | null>;
}
