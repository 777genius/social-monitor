import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { SourceBindingView } from '../../features/shared/source-binding-presenter';
import type { SourceBindingStatus } from '../../domain';

export const sourceBindingStatusValues = ['enabled', 'paused'] as const satisfies readonly SourceBindingStatus[];

export class SourceBindingResponseDto implements SourceBindingView {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly tenantId: SourceBindingView['tenantId'];

  @ApiProperty()
  declare readonly workspaceId: SourceBindingView['workspaceId'];

  @ApiProperty()
  declare readonly topicId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly capabilityProfileVersion: number;

  @ApiProperty({ enum: sourceBindingStatusValues })
  declare readonly status: SourceBindingStatus;

  @ApiProperty({ type: 'object', additionalProperties: true })
  declare readonly configPreview: SourceBindingView['configPreview'];

  @ApiProperty({ format: 'date-time' })
  declare readonly createdAt: string;
}

export class ListSourceBindingsResponseDto {
  @ApiProperty({ type: () => [SourceBindingResponseDto] })
  declare readonly sourceBindings: readonly SourceBindingResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
