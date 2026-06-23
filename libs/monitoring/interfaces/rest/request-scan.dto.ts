import { ApiProperty } from '@nestjs/swagger';

import type { ScanJobStatus } from '../../domain';
import { scanJobStatusValues } from './scan-status.dto';

export class RequestScanResponseDto {
  @ApiProperty()
  declare readonly scanJobId: string;

  @ApiProperty({ enum: scanJobStatusValues })
  declare readonly status: ScanJobStatus;

  @ApiProperty()
  declare readonly created: boolean;
}
