import { ApiProperty } from '@nestjs/swagger';

import type { ScanPolicyView } from '../../features/shared/scan-policy-presenter';

export class GetScanPolicyResponseDto implements ScanPolicyView {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly tenantId: ScanPolicyView['tenantId'];

  @ApiProperty()
  declare readonly workspaceId: ScanPolicyView['workspaceId'];

  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly intervalSeconds: number;

  @ApiProperty()
  declare readonly freshnessSeconds: number;

  @ApiProperty()
  declare readonly retryBudget: number;

  @ApiProperty({ format: 'date-time' })
  declare readonly nextRunAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly createdAt: string;
}
