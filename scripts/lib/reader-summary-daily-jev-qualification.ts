import type { Clock } from "@social-monitor/shared-kernel";
import { JevReaderSummaryCandidateQualification } from '@social-monitor/summary/adapters/evidence/jev-reader-summary-candidate-qualification';
import type { ReaderSummaryCandidateQualificationAudit } from '@social-monitor/summary/application/contracts/reader-summary-candidate-qualification';
import { PrismaReaderValueExistingAssessment } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-existing-assessment';
import { PrismaReaderValueInventory } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-inventory';
import { ConservativeReaderValueInputBuilder } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder';
import { SourceContentSafetyPolicy } from '@social-monitor/relevance/domain/source-content-safety';
import type { AssessmentSqlClient } from '@social-monitor/relevance/infrastructure/reader-value/assessment-sql';
import type { ConfiguredInterestReaderPort } from '@social-monitor/relevance/ports';
import type { ReaderValueScoringProvider } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-provider-config';

export const createDailyJevCaptureQualification = (input: {
  fresh: boolean; mode: string | undefined; client: unknown; clock: Clock;
  interests: ConfiguredInterestReaderPort | undefined;
  scoringProvider?: ReaderValueScoringProvider;
}) => {
  let audit: ReaderSummaryCandidateQualificationAudit | undefined;
  if (!input.fresh || input.mode !== 'jev_primary_v3') return { selector: undefined, audit: () => audit };
  if (input.interests === undefined) throw new Error('Jev capture requires current interest authority');
  const client = input.client as AssessmentSqlClient;
  const selector = new JevReaderSummaryCandidateQualification(new PrismaReaderValueInventory(client),
    new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy(), input.scoringProvider ?? 'openrouter-systemone'),
    new PrismaReaderValueExistingAssessment(client), input.interests, input.clock,
    new SourceContentSafetyPolicy(),
    (value) => { audit = value; });
  return { selector, audit: () => audit };
};
