import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

import type { GetNotificationPreferenceResult } from '../../features/get-notification-preference/get-notification-preference.result';
import type { SetNotificationPreferenceResult } from '../../features/set-notification-preference/set-notification-preference.result';

export class SetNotificationPreferenceRequestDto {
  @IsString()
  @MinLength(1)
  recipientKey!: string;

  @IsString()
  @IsIn(['in_app', 'email', 'webhook'])
  channel!: 'in_app' | 'email' | 'webhook';

  @IsBoolean()
  allowed!: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string;
}

export type SetNotificationPreferenceResponseDto = SetNotificationPreferenceResult;
export type GetNotificationPreferenceResponseDto = GetNotificationPreferenceResult;
