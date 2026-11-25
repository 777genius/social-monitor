import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

import type { SourceBindingStatus } from '../../domain';
import { sourceBindingStatusValues } from './list-source-bindings.dto';

export class ChangeSourceBindingStatusRequestDto {
  @ApiProperty({ enum: sourceBindingStatusValues })
  @IsIn(['enabled', 'paused'])
  declare readonly status: SourceBindingStatus;
}

export class ChangeSourceBindingStatusResponseDto {
  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty({ enum: sourceBindingStatusValues })
  declare readonly status: SourceBindingStatus;

  @ApiProperty()
  declare readonly changed: boolean;
}
