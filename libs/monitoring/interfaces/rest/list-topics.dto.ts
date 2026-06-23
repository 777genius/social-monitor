import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { TopicView } from '../../features/shared/topic-presenter';

export class TopicResponseDto implements TopicView {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly tenantId: TopicView['tenantId'];

  @ApiProperty()
  declare readonly workspaceId: TopicView['workspaceId'];

  @ApiProperty()
  declare readonly name: string;

  @ApiProperty()
  declare readonly query: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly createdAt: string;
}

export class ListTopicsResponseDto {
  @ApiProperty({ type: () => [TopicResponseDto] })
  declare readonly topics: readonly TopicResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
