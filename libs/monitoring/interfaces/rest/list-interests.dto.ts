import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { InterestView } from '../../features/shared/interest-presenter';

export class InterestResponseDto implements InterestView {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly tenantId: InterestView['tenantId'];

  @ApiProperty()
  declare readonly workspaceId: InterestView['workspaceId'];

  @ApiProperty()
  declare readonly name: string;

  @ApiProperty()
  declare readonly query: string;

  @ApiProperty({ enum: ['active', 'archived'] })
  declare readonly status: InterestView['status'];

  @ApiProperty({ format: 'date-time' })
  declare readonly createdAt: string;
}

export class ListInterestsResponseDto {
  @ApiProperty({ type: () => [InterestResponseDto] })
  declare readonly interests: readonly InterestResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
