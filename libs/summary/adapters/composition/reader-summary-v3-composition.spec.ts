import { FixedClock } from "@social-monitor/shared-kernel";
import { ConservativeReaderValueInputBuilder } from '@social-monitor/relevance/infrastructure/reader-value/reader-value-input-builder';
import { SourceContentSafetyPolicy } from '@social-monitor/relevance/domain/source-content-safety';
import { createReaderSummaryV3Preflight, createReaderSummaryV3Promotion } from './reader-summary-v3-composition';
import { PrismaReaderSummaryJobRepository } from '../persistence/prisma/prisma-reader-summary-job.repository';
import type { PrismaSummaryClient } from '../persistence/prisma/prisma-summary-client';
import type { GrpcAgentRuntimeClient } from '../model/grpc-agent-runtime-client';
import type { RelevanceReaderSummaryEvidenceSelector } from '../evidence/relevance-reader-summary-evidence.selector';
import { PrismaReaderSummaryV3Preflight } from '../persistence/prisma/prisma-reader-summary-v3-preflight';
import { RelevanceReaderSummaryV3Promotion } from '../evidence/relevance-reader-summary-v3-promotion';

describe('Shared normal and native V3 composition', () => {
  it.each(['openrouter-systemone', 'openai-decisions'] as const)('constructs real %s preparation without credentials, DB or model work', (provider) => {
    const transaction=jest.fn();
    const client={$transaction:transaction} as unknown as PrismaSummaryClient;
    const interests={readCurrent:jest.fn()};
    const runtime={runTask:jest.fn()} as unknown as GrpcAgentRuntimeClient;
    const supplemental={selectSupplemental:jest.fn()} as unknown as RelevanceReaderSummaryEvidenceSelector;
    expect(createReaderSummaryV3Preflight(client,new PrismaReaderSummaryJobRepository(client),interests,new FixedClock(new Date("2026-10-15T00:00:00Z")),{generate:()=>"TEST-id"},
      new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy(), provider)))
      .toBeInstanceOf(PrismaReaderSummaryV3Preflight);
    expect(createReaderSummaryV3Promotion(client,{client:runtime,model:'mimo-v2.6-pro',modelBackend:'xiaomi-mimo-token-plan'},runtime,supplemental))
      .toBeInstanceOf(RelevanceReaderSummaryV3Promotion);
    expect(transaction).not.toHaveBeenCalled();expect(interests.readCurrent).not.toHaveBeenCalled();
    expect(runtime.runTask).not.toHaveBeenCalled();expect(supplemental.selectSupplemental).not.toHaveBeenCalled();
  });
});
