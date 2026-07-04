import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  type RelevanceFeedbackAction,
  relevanceFeedbackActions,
  type RelevanceFeedbackReason,
  relevanceFeedbackReasons,
  postRatingReasons,
  type RelevanceWeight,
} from '../../domain';

const sourceContentSafetyStatuses = ['allowed', 'sanitized', 'blocked'] as const;
const sourceContentSafetyCategories = [
  'prompt_injection',
  'sensitive_data',
  'untrusted_instruction',
  'raw_payload_retention_disabled',
] as const;
const sourceContentSafetyRetentionPolicies = ['normalized_preview_only'] as const;
const relevanceLearningDirections = ['positive', 'negative', 'block_provider', 'recorded'] as const;
const postRatingLearningEffects = ['negative', 'neutral', 'positive'] as const;
const personalizedDigestStatuses = ['assembled', 'empty'] as const;
const relevanceMemoryGuidanceStatuses = ['disabled', 'available', 'empty', 'unavailable'] as const;

export class RelevanceWeightDto implements RelevanceWeight {
  @ApiProperty()
  @IsString()
  declare readonly key: string;

  @ApiProperty({ minimum: -3, maximum: 3 })
  @IsNumber()
  @Min(-3)
  @Max(3)
  declare readonly weight: number;
}

export class UpsertUserRelevanceProfileRequestDto {
  @ApiPropertyOptional({ type: () => [RelevanceWeightDto] })
  @IsOptional()
  @Type(() => RelevanceWeightDto)
  @ValidateNested({ each: true })
  declare readonly interestWeights?: readonly RelevanceWeightDto[];

  @ApiPropertyOptional({ type: () => [RelevanceWeightDto] })
  @IsOptional()
  @Type(() => RelevanceWeightDto)
  @ValidateNested({ each: true })
  declare readonly sourceWeights?: readonly RelevanceWeightDto[];

  @ApiPropertyOptional({ type: () => [RelevanceWeightDto] })
  @IsOptional()
  @Type(() => RelevanceWeightDto)
  @ValidateNested({ each: true })
  declare readonly keywordWeights?: readonly RelevanceWeightDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  declare readonly mutedKeywords?: readonly string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsString({ each: true })
  declare readonly blockedProviderKeys?: readonly string[];
}

export class RecordRelevanceFeedbackRequestDto {
  @ApiProperty()
  @IsString()
  declare readonly idempotencyKey: string;

  @ApiProperty({ enum: relevanceFeedbackActions })
  @IsIn(relevanceFeedbackActions)
  declare readonly action: RelevanceFeedbackAction;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  declare readonly rating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly feedItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly sourceItemId?: string;

  @ApiProperty()
  @IsString()
  declare readonly interestId: string;

  @ApiProperty()
  @IsString()
  declare readonly providerKey: string;

  @ApiProperty()
  @IsString()
  declare readonly title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly bodyPreview?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly canonicalUrl?: string;

  @ApiPropertyOptional({ enum: relevanceFeedbackReasons })
  @IsOptional()
  @IsIn(relevanceFeedbackReasons)
  declare readonly reason?: RelevanceFeedbackReason;
}

export class UserRelevanceProfileDto {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly userId: string;

  @ApiProperty({ type: () => [RelevanceWeightDto] })
  declare readonly interestWeights: readonly RelevanceWeightDto[];

  @ApiProperty({ type: () => [RelevanceWeightDto] })
  declare readonly sourceWeights: readonly RelevanceWeightDto[];

  @ApiProperty({ type: () => [RelevanceWeightDto] })
  declare readonly keywordWeights: readonly RelevanceWeightDto[];

  @ApiProperty({ type: [String] })
  declare readonly mutedKeywords: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly blockedProviderKeys: readonly string[];

  @ApiProperty()
  declare readonly rulesVersion: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly updatedAt: string;
}

export class UpsertUserRelevanceProfileResponseDto {
  @ApiProperty({ type: () => UserRelevanceProfileDto })
  declare readonly profile: UserRelevanceProfileDto;

  @ApiProperty()
  declare readonly created: boolean;
}

export class SourceContentSafetyDto {
  @ApiProperty({ enum: sourceContentSafetyStatuses })
  declare readonly status: string;

  @ApiProperty({ enum: sourceContentSafetyCategories, isArray: true })
  declare readonly categories: readonly string[];

  @ApiProperty()
  declare readonly rawPayloadRetained: false;

  @ApiProperty({ enum: sourceContentSafetyRetentionPolicies })
  declare readonly retentionPolicy: string;
}

export class RelevanceMemoryGuidanceDto {
  @ApiProperty({ enum: relevanceMemoryGuidanceStatuses })
  declare readonly status: (typeof relevanceMemoryGuidanceStatuses)[number];

  @ApiProperty()
  declare readonly applied: boolean;

  @ApiProperty()
  declare readonly providerPreferenceCount: number;

  @ApiProperty()
  declare readonly keywordPreferenceCount: number;

  @ApiProperty()
  declare readonly mutedKeywordCount: number;

  @ApiProperty()
  declare readonly blockedProviderCount: number;

  @ApiProperty({ type: [String] })
  declare readonly signals: readonly string[];
}

export class RankedFeedItemDto {
  @ApiProperty()
  declare readonly feedItemId: string;

  @ApiProperty()
  declare readonly sourceItemId: string;

  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly interestId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly canonicalUrl: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiPropertyOptional()
  declare readonly bodyPreview?: string;

  @ApiPropertyOptional({ type: Object })
  declare readonly providerMetadata?: Record<string, unknown>;

  @ApiPropertyOptional()
  declare readonly authorHandle?: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly publishedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly observedAt: string;

  @ApiProperty()
  declare readonly score: number;

  @ApiProperty()
  declare readonly rank: number;

  @ApiProperty()
  declare readonly clusterId: string;

  @ApiProperty()
  declare readonly clusterSize: number;

  @ApiProperty({ type: [String] })
  declare readonly duplicateFeedItemIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly whyImportant: readonly string[];

  @ApiProperty({ type: () => SourceContentSafetyDto })
  declare readonly safety: SourceContentSafetyDto;
}

export class RankFeedItemsResponseDto {
  @ApiProperty({ format: 'date-time' })
  declare readonly generatedAt: string;

  @ApiProperty()
  declare readonly profileApplied: boolean;

  @ApiPropertyOptional({ type: () => UserRelevanceProfileDto })
  declare readonly profile?: UserRelevanceProfileDto;

  @ApiPropertyOptional({ type: () => RelevanceMemoryGuidanceDto })
  declare readonly memoryGuidance?: RelevanceMemoryGuidanceDto;

  @ApiProperty({ type: () => [RankedFeedItemDto] })
  declare readonly items: readonly RankedFeedItemDto[];
}

export class PersonalizedDigestWindowDto {
  @ApiProperty({ format: 'date-time' })
  declare readonly startedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly endedAt: string;
}

export class BuildPersonalizedDigestResponseDto {
  @ApiProperty()
  declare readonly userId: string;

  @ApiProperty({ enum: personalizedDigestStatuses })
  declare readonly status: (typeof personalizedDigestStatuses)[number];

  @ApiProperty({ type: () => PersonalizedDigestWindowDto })
  declare readonly window: PersonalizedDigestWindowDto;

  @ApiProperty({ type: [String] })
  declare readonly interestIds: readonly string[];

  @ApiPropertyOptional({ type: () => RelevanceMemoryGuidanceDto })
  declare readonly memoryGuidance?: RelevanceMemoryGuidanceDto;

  @ApiProperty({ type: () => [RankedFeedItemDto] })
  declare readonly items: readonly RankedFeedItemDto[];

  @ApiProperty({ type: [String] })
  declare readonly highSignalFeedItemIds: readonly string[];
}

export class RelevanceFeedbackTargetDto {
  @ApiPropertyOptional()
  declare readonly feedItemId?: string;

  @ApiPropertyOptional()
  declare readonly sourceItemId?: string;

  @ApiProperty()
  declare readonly interestId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiPropertyOptional({ enum: relevanceFeedbackReasons })
  declare readonly feedbackReason?: RelevanceFeedbackReason;
}

export class RelevanceFeedbackSignalDto {
  @ApiProperty()
  declare readonly feedbackId: string;

  @ApiProperty()
  declare readonly userId: string;

  @ApiProperty({ enum: relevanceFeedbackActions })
  declare readonly action: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  declare readonly rating?: number;

  @ApiProperty({ type: () => RelevanceFeedbackTargetDto })
  declare readonly target: RelevanceFeedbackTargetDto;

  @ApiProperty({ format: 'date-time' })
  declare readonly createdAt: string;
}

export class RecordRelevanceFeedbackResponseDto {
  @ApiProperty({ type: () => RelevanceFeedbackSignalDto })
  declare readonly feedback: RelevanceFeedbackSignalDto;

  @ApiProperty({ type: () => UserRelevanceProfileDto })
  declare readonly profile: UserRelevanceProfileDto;

  @ApiProperty()
  declare readonly created: boolean;

  @ApiProperty({ enum: relevanceLearningDirections })
  declare readonly learningDirection: string;
}

export class PostRatingLookupTargetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly feedItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly sourceItemId?: string;

  @ApiProperty()
  @IsString()
  declare readonly interestId: string;
}

export class ListPostRatingsRequestDto {
  @ApiProperty({ type: () => [PostRatingLookupTargetDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @Type(() => PostRatingLookupTargetDto)
  @ValidateNested({ each: true })
  declare readonly targets: readonly PostRatingLookupTargetDto[];
}

export class RecordPostRatingRequestDto {
  @ApiProperty()
  @IsString()
  declare readonly idempotencyKey: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  declare readonly rating: number;

  @ApiPropertyOptional({ enum: postRatingReasons })
  @IsOptional()
  @IsIn(postRatingReasons)
  declare readonly reason?: (typeof postRatingReasons)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly feedItemId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly sourceItemId?: string;

  @ApiProperty()
  @IsString()
  declare readonly interestId: string;

  @ApiProperty()
  @IsString()
  declare readonly providerKey: string;

  @ApiProperty()
  @IsString()
  declare readonly title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly bodyPreview?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly canonicalUrl?: string;
}

export class PostRatingTargetDto {
  @ApiPropertyOptional()
  declare readonly feedItemId?: string;

  @ApiPropertyOptional()
  declare readonly sourceItemId?: string;

  @ApiProperty()
  declare readonly interestId: string;
}

export class PostRatingDto {
  @ApiProperty()
  declare readonly feedbackId: string;

  @ApiProperty()
  declare readonly userId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  declare readonly rating: number;

  @ApiProperty({ enum: postRatingLearningEffects })
  declare readonly learningEffect: (typeof postRatingLearningEffects)[number];

  @ApiPropertyOptional({ enum: postRatingReasons })
  declare readonly reason?: (typeof postRatingReasons)[number];

  @ApiProperty({ type: () => PostRatingTargetDto })
  declare readonly target: PostRatingTargetDto;

  @ApiProperty({ format: 'date-time' })
  declare readonly ratedAt: string;
}

export class ListPostRatingsResponseDto {
  @ApiProperty({ type: () => [PostRatingDto] })
  declare readonly ratings: readonly PostRatingDto[];
}

export class RecordPostRatingResponseDto {
  @ApiProperty({ type: () => PostRatingDto })
  declare readonly rating: PostRatingDto;

  @ApiProperty()
  declare readonly created: boolean;

  @ApiProperty({ enum: ['recorded'] })
  declare readonly learningDirection: 'recorded';
}
