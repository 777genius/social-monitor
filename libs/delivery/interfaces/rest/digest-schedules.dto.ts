import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

import type { CreateDigestScheduleResult } from '../../features/create-digest-schedule/create-digest-schedule.result';
import type { GetDigestScheduleResult } from '../../features/get-digest-schedule/get-digest-schedule.result';
import type { ListDigestSchedulesResult } from '../../features/list-digest-schedules/list-digest-schedules.result';

export class CreateDigestScheduleRequestDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  recipientKey!: string;

  @ApiProperty({ enum: ['in_app', 'email', 'webhook'] })
  @IsString()
  @IsIn(['in_app', 'email', 'webhook'])
  channel!: 'in_app' | 'email' | 'webhook';

  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  interestIds!: string[];

  @ApiProperty({ minimum: 60 })
  @IsInt()
  @Min(60)
  intervalSeconds!: number;

  @ApiProperty()
  @IsBoolean()
  includeNoSignal!: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  @IsISO8601()
  nextRunAt?: string;
}

export type CreateDigestScheduleResponseDto = CreateDigestScheduleResult;
export type GetDigestScheduleResponseDto = GetDigestScheduleResult;
export type ListDigestSchedulesResponseDto = ListDigestSchedulesResult;
