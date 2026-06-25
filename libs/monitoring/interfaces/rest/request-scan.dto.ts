import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ScanJobStatus } from '../../domain';
import { scanJobStatusValues, ScanStatusResponseDto } from './scan-status.dto';

export class RequestScanResponseDto {
  @ApiProperty()
  declare readonly scanJobId: string;

  @ApiProperty({ enum: scanJobStatusValues })
  declare readonly status: ScanJobStatus;

  @ApiProperty()
  declare readonly created: boolean;
}

export class ListScanRequestsResponseDto {
  @ApiProperty({ type: () => ScanStatusResponseDto, isArray: true })
  declare readonly scanRequests: readonly ScanStatusResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
