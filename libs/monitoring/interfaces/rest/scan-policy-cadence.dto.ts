import { ApiProperty } from '@nestjs/swagger';

import type { ScanPolicyCadenceView } from '../../features/shared/scan-policy-presenter';

export class ScanPolicyCadenceResponseDto implements ScanPolicyCadenceView {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly minimumIntervalSeconds: number;

  @ApiProperty()
  declare readonly configuredIntervalSeconds: number;

  @ApiProperty()
  declare readonly configuredFreshnessSeconds: number;

  @ApiProperty()
  declare readonly effectiveIntervalSeconds: number;

  @ApiProperty()
  declare readonly effectiveFreshnessSeconds: number;

  @ApiProperty()
  declare readonly providerMinimumIntervalEnforced: boolean;
}
