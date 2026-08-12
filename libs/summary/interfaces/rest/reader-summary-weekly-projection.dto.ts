import { ApiProperty } from "@nestjs/swagger";

import { readerSummaryWeeklyProjectionBlockingReasons } from "../../features/get-reader-summary-weekly-projection/get-reader-summary-weekly-projection.use-case";

const weeklyProjectionStatuses = ["unavailable", "partial", "complete"] as const;
const weeklyStoryStatuses = ["new", "developing", "resolved", "watch"] as const;
const weeklySectionKinds = [
  "lead",
  "development",
  "why_it_matters",
  "watch",
] as const;
const weeklyClaimTypes = ["snapshot", "evolution", "resolution"] as const;

export class ReaderSummaryWeeklyProjectionStoryDto {
  @ApiProperty()
  declare readonly storyId: string;

  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty()
  declare readonly summary: string;

  @ApiProperty({ enum: weeklyStoryStatuses })
  declare readonly status: (typeof weeklyStoryStatuses)[number];

  @ApiProperty({ format: "date" })
  declare readonly observedFrom: string;

  @ApiProperty({ format: "date" })
  declare readonly observedThrough: string;

  @ApiProperty({ type: () => [String] })
  declare readonly citationIds: readonly string[];
}

export class ReaderSummaryWeeklyProjectionSectionDto {
  @ApiProperty()
  declare readonly sectionId: string;

  @ApiProperty()
  declare readonly storyId: string;

  @ApiProperty({ enum: weeklySectionKinds })
  declare readonly kind: (typeof weeklySectionKinds)[number];

  @ApiProperty({ enum: weeklyClaimTypes })
  declare readonly claimType: (typeof weeklyClaimTypes)[number];

  @ApiProperty()
  declare readonly heading: string;

  @ApiProperty()
  declare readonly text: string;

  @ApiProperty({ format: "date" })
  declare readonly observedFrom: string;

  @ApiProperty({ format: "date" })
  declare readonly observedThrough: string;

  @ApiProperty({ type: () => [String] })
  declare readonly citationIds: readonly string[];
}

export class ReaderSummaryWeeklyProjectionCitationDto {
  @ApiProperty()
  declare readonly citationId: string;

  @ApiProperty({ format: "date" })
  declare readonly requestedUtcDate: string;

  @ApiProperty()
  declare readonly publicationId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly feedItemId: string;

  @ApiProperty()
  declare readonly sourceItemId: string;

  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly providerItemId: string;

  @ApiProperty()
  declare readonly canonicalUrl: string;

  @ApiProperty()
  declare readonly sourceContentHash: string;
}

export class ReaderSummaryWeeklyProjectionArtifactDto {
  @ApiProperty()
  declare readonly artifactId: string;

  @ApiProperty()
  declare readonly schemaVersion: string;

  @ApiProperty()
  declare readonly sealId: string;

  @ApiProperty()
  declare readonly sealSha256: string;

  @ApiProperty()
  declare readonly publicationProofId: string;

  @ApiProperty()
  declare readonly publicationProofSha256: string;

  @ApiProperty()
  declare readonly modelInputSealId: string;

  @ApiProperty()
  declare readonly modelInputSealSha256: string;

  @ApiProperty()
  declare readonly artifactSha256: string;

  @ApiProperty()
  declare readonly editorialQualitySha256: string;

  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty({ type: () => [String] })
  declare readonly headlineCitationIds: readonly string[];

  @ApiProperty()
  declare readonly takeaway: string;

  @ApiProperty({ type: () => [String] })
  declare readonly takeawayCitationIds: readonly string[];

  @ApiProperty()
  declare readonly synthesis: string;

  @ApiProperty({ type: () => [String] })
  declare readonly synthesisCitationIds: readonly string[];

  @ApiProperty({ type: () => [ReaderSummaryWeeklyProjectionStoryDto] })
  declare readonly stories: readonly ReaderSummaryWeeklyProjectionStoryDto[];

  @ApiProperty({ type: () => [ReaderSummaryWeeklyProjectionSectionDto] })
  declare readonly sections: readonly ReaderSummaryWeeklyProjectionSectionDto[];

  @ApiProperty({ type: () => [ReaderSummaryWeeklyProjectionCitationDto] })
  declare readonly citations: readonly ReaderSummaryWeeklyProjectionCitationDto[];
}

export class ReaderSummaryWeeklyProjectionResponseDto {
  @ApiProperty({ enum: ["reader_summary.weekly_projection.v1"] })
  declare readonly schemaVersion: "reader_summary.weekly_projection.v1";

  @ApiProperty()
  declare readonly tenantId: string;

  @ApiProperty()
  declare readonly workspaceId: string;

  @ApiProperty({ format: "date" })
  declare readonly weekStartedOn: string;

  @ApiProperty({ format: "date" })
  declare readonly weekEndedOn: string;

  @ApiProperty({ enum: weeklyProjectionStatuses })
  declare readonly status: (typeof weeklyProjectionStatuses)[number];

  @ApiProperty({ type: () => [String], format: "date" })
  declare readonly certifiedDailyEvidenceDates: readonly string[];

  @ApiProperty({ type: () => [String], format: "date" })
  declare readonly missingDailyEvidenceDates: readonly string[];

  @ApiProperty({
    enum: readerSummaryWeeklyProjectionBlockingReasons,
    isArray: true,
  })
  declare readonly blockingReasons: readonly (
    typeof readerSummaryWeeklyProjectionBlockingReasons
  )[number][];

  @ApiProperty({
    type: () => ReaderSummaryWeeklyProjectionArtifactDto,
    nullable: true,
  })
  declare readonly artifact: ReaderSummaryWeeklyProjectionArtifactDto | null;
}
