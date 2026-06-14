import { IsIn } from 'class-validator';

import type { SourceBindingStatus } from '../../domain';

export class ChangeSourceBindingStatusRequestDto {
  @IsIn(['enabled', 'paused'])
  status!: SourceBindingStatus;
}

export type ChangeSourceBindingStatusResponseDto = {
  readonly sourceBindingId: string;
  readonly status: SourceBindingStatus;
  readonly changed: boolean;
};
