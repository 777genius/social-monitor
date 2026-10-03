import type { ReaderSummaryJobProps } from "../../domain";

export const readerSummaryFirstPublicationPrefix = "historical-first-publication:v1:";

/** Operator composition supplies a validated manifest and a committed day
 * reservation. Ordinary queue workers cannot reconstruct this authority. */
export interface ReaderSummaryFirstPublicationAuthority {
  claim(job: ReaderSummaryJobProps): Promise<Readonly<{
    observedThrough: Date;
    manifestSha256: string;
    sourceIdentity: string;
    providerCoverage: "UNPROVEN";
  }>>;
}
