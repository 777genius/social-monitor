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
  @IsString()
  @MinLength(1)
  recipientKey!: string;

  @IsString()
  @IsIn(['in_app', 'email', 'webhook'])
  channel!: 'in_app' | 'email' | 'webhook';

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  topicIds!: string[];

  @IsInt()
  @Min(60)
  intervalSeconds!: number;

  @IsBoolean()
  includeNoSignal!: boolean;

  @IsOptional()
  @IsString()
  @IsISO8601()
  nextRunAt?: string;
}

export type CreateDigestScheduleResponseDto = CreateDigestScheduleResult;
export type GetDigestScheduleResponseDto = GetDigestScheduleResult;
export type ListDigestSchedulesResponseDto = ListDigestSchedulesResult;
