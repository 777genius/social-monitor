import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SourceBindingHealthResponseDto } from './source-binding-health.dto';

export class ListSourceBindingOverviewResponseDto {
  @ApiProperty({ type: () => [SourceBindingHealthResponseDto] })
  declare readonly items: readonly SourceBindingHealthResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
