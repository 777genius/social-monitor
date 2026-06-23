import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FeedItemDto {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly topicId: string;

  @ApiProperty()
  declare readonly sourceItemId: string;

  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly canonicalUrl: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly bodyPreview: string;

  @ApiPropertyOptional()
  declare readonly authorHandle?: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly publishedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly observedAt: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  declare readonly providerMetadata?: Readonly<Record<string, unknown>>;
}

export class ListFeedItemsResponseDto {
  @ApiProperty({ type: () => [FeedItemDto] })
  declare readonly items: readonly FeedItemDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}

export class GetFeedItemResponseDto extends FeedItemDto {}
