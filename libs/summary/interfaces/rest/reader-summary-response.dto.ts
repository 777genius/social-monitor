import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { readerSummaryQualityFlags } from "./reader-summary-contract.constants";
import { ReaderSummaryCoverageSummaryDto } from "./reader-summary-coverage.dto";
import {
  ReaderSummaryCitationViewDto,
  ReaderSummaryInterestHighlightDto,
  ReaderSummaryRepeatedSignalDto,
  ReaderSummaryRiskDto,
  ReaderSummaryStoryClusterDto,
  ReaderSummaryTopStoryDto,
} from "./reader-summary-evidence.dto";
import {
  ReaderSummaryConfidenceDto,
  ReaderSummaryContextArtifactDto,
  ReaderSummaryFreshnessDto,
  ReaderSummaryLineageDto,
  ReaderSummaryPersonalizationDto,
  ReaderSummaryUsageDto,
} from "./reader-summary-metadata.dto";
import { ReaderSummaryReaderBriefDto } from "./reader-summary-reader.dto";
import {
  ReaderSummaryPeriodDto,
  ReaderSummaryScopeDto,
  ReaderSummarySourceWindowDto,
} from "./reader-summary-scope-period.dto";

export class ReaderSummaryArtifactResponseDto {
  @ApiProperty()
  declare readonly schemaVersion: string;

  @ApiProperty()
  declare readonly readerSummaryId: string;

  @ApiProperty()
  declare readonly tenantId: string;

  @ApiProperty()
  declare readonly workspaceId: string;

  @ApiProperty({ type: () => ReaderSummaryScopeDto })
  declare readonly scope: ReaderSummaryScopeDto;

  @ApiProperty({ type: () => ReaderSummaryPeriodDto })
  declare readonly period: ReaderSummaryPeriodDto;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly generatedAt?: Date;

  @ApiPropertyOptional()
  declare readonly userId?: string;

  @ApiPropertyOptional()
  declare readonly subscriptionId?: string;

  @ApiProperty({ type: () => ReaderSummarySourceWindowDto })
  declare readonly sourceWindow: ReaderSummarySourceWindowDto;

  @ApiProperty({ type: () => [ReaderSummaryStoryClusterDto] })
  declare readonly storyClusters: readonly ReaderSummaryStoryClusterDto[];

  @ApiProperty({ type: () => [ReaderSummaryContextArtifactDto] })
  declare readonly contextArtifacts: readonly ReaderSummaryContextArtifactDto[];

  @ApiPropertyOptional({ type: () => ReaderSummaryPersonalizationDto })
  declare readonly personalization?: ReaderSummaryPersonalizationDto;

  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty()
  declare readonly executiveSummary: string;

  @ApiProperty({ type: () => ReaderSummaryReaderBriefDto })
  declare readonly readerBrief: ReaderSummaryReaderBriefDto;

  @ApiProperty({ type: () => [ReaderSummaryTopStoryDto] })
  declare readonly topStories: readonly ReaderSummaryTopStoryDto[];

  @ApiProperty({ type: () => [ReaderSummaryInterestHighlightDto] })
  declare readonly interestHighlights: readonly ReaderSummaryInterestHighlightDto[];

  @ApiProperty({ type: () => [ReaderSummaryRepeatedSignalDto] })
  declare readonly repeatedSignals: readonly ReaderSummaryRepeatedSignalDto[];

  @ApiProperty({ type: () => [ReaderSummaryRiskDto] })
  declare readonly risksAndUnknowns: readonly ReaderSummaryRiskDto[];

  @ApiProperty({ type: () => [ReaderSummaryCitationViewDto] })
  declare readonly citations: readonly ReaderSummaryCitationViewDto[];

  @ApiProperty({ enum: readerSummaryQualityFlags, isArray: true })
  declare readonly qualityFlags: readonly (typeof readerSummaryQualityFlags)[number][];

  @ApiProperty({ type: () => ReaderSummaryConfidenceDto })
  declare readonly confidence: ReaderSummaryConfidenceDto;

  @ApiProperty({ type: () => ReaderSummaryLineageDto })
  declare readonly lineage: ReaderSummaryLineageDto;

  @ApiProperty({ type: () => ReaderSummaryUsageDto })
  declare readonly usage: ReaderSummaryUsageDto;

  @ApiPropertyOptional()
  declare readonly noSignalReason?: string;

  @ApiProperty({ type: () => ReaderSummaryFreshnessDto })
  declare readonly freshness: ReaderSummaryFreshnessDto;

  @ApiPropertyOptional({ type: () => ReaderSummaryCoverageSummaryDto })
  declare readonly coverage?: ReaderSummaryCoverageSummaryDto;
}

export class ReaderSummaryResponseDto extends ReaderSummaryArtifactResponseDto {}

export class ListReaderSummariesResponseDto {
  @ApiProperty({ type: () => [ReaderSummaryArtifactResponseDto] })
  declare readonly items: readonly ReaderSummaryArtifactResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}

export class ReaderSummaryPeriodSummaryDto {
  @ApiProperty()
  declare readonly readerSummaryId: string;

  @ApiProperty()
  declare readonly tenantId: string;

  @ApiProperty()
  declare readonly workspaceId: string;

  @ApiProperty({ type: () => ReaderSummaryScopeDto })
  declare readonly scope: ReaderSummaryScopeDto;

  @ApiProperty({ type: () => ReaderSummaryPeriodDto })
  declare readonly period: ReaderSummaryPeriodDto;

  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty({ enum: ["completed", "no_signal"] })
  declare readonly status: "completed" | "no_signal";

  @ApiPropertyOptional()
  declare readonly userId?: string;

  @ApiPropertyOptional()
  declare readonly subscriptionId?: string;
}

export class ListReaderSummaryPeriodsResponseDto {
  @ApiProperty({ type: () => [ReaderSummaryPeriodSummaryDto] })
  declare readonly items: readonly ReaderSummaryPeriodSummaryDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
