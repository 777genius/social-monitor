import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

import type { GetNotificationPreferenceResult } from '../../features/get-notification-preference/get-notification-preference.result';
import type { SetNotificationPreferenceResult } from '../../features/set-notification-preference/set-notification-preference.result';

export class SetNotificationPreferenceRequestDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  recipientKey!: string;

  @ApiProperty({ enum: ['in_app', 'email', 'webhook'] })
  @IsString()
  @IsIn(['in_app', 'email', 'webhook'])
  channel!: 'in_app' | 'email' | 'webhook';

  @ApiProperty()
  @IsBoolean()
  allowed!: boolean;

  @ApiPropertyOptional({ minLength: 1 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}

export type SetNotificationPreferenceResponseDto = SetNotificationPreferenceResult;
export type GetNotificationPreferenceResponseDto = GetNotificationPreferenceResult;
