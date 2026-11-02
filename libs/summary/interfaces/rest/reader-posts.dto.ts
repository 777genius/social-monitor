import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ReaderPostDto {
  @ApiProperty() declare readonly id: string;
  @ApiProperty() declare readonly sourceItemId: string;
  @ApiProperty() declare readonly providerKey: string;
  @ApiProperty() declare readonly providerFamily: string;
  @ApiProperty() declare readonly title: string;
  @ApiProperty() declare readonly bodyPreview: string;
  @ApiProperty() declare readonly canonicalUrl: string;
  @ApiProperty() declare readonly publishedAt: string;
  @ApiProperty({ type: Number, nullable: true }) declare readonly engagement: number | null;
  @ApiProperty({ type: String, nullable: true }) declare readonly engagementObservedAt: string | null;
  @ApiProperty({ type: String, nullable: true }) declare readonly usefulness: string | null;
  @ApiProperty({ type: String, nullable: true }) declare readonly relevance: string | null;
  @ApiPropertyOptional({ type: String, description: "Whether the original quoted post text was captured; the author text is assessed separately" })
  declare readonly quotedContext?: string;
}

export class ReaderPostsPageDto {
  @ApiProperty({ type: () => [ReaderPostDto] }) declare readonly items: readonly ReaderPostDto[];
  @ApiProperty() declare readonly total: number;
  @ApiProperty({ type: [String] }) declare readonly providerKeys: readonly string[];
  @ApiPropertyOptional() declare readonly nextCursor?: string;
}
