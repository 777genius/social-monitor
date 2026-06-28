import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';

import {
  digestFrequencyValues,
  telemetryConsentValues,
  type WorkspaceDigestFrequency,
  type WorkspaceTelemetryConsent,
} from '../../features/shared/workspace-settings-preferences';

export class WorkspaceSettingsDiagnosticsDto {
  @ApiProperty()
  declare readonly traceId: string;

  @ApiProperty()
  declare readonly routeId: string;

  @ApiProperty()
  declare readonly releaseVersion: string;

  @ApiProperty()
  declare readonly featureSnapshot: string;
}

export class WorkspaceSettingsResponseDto {
  @ApiProperty()
  declare readonly workspaceRole: string;

  @ApiProperty({ enum: digestFrequencyValues })
  declare readonly digestFrequency: WorkspaceDigestFrequency;

  @ApiProperty({ enum: telemetryConsentValues })
  declare readonly telemetryConsent: WorkspaceTelemetryConsent;

  @ApiProperty({ type: WorkspaceSettingsDiagnosticsDto })
  declare readonly diagnostics: WorkspaceSettingsDiagnosticsDto;
}

export class UpdateWorkspaceDigestPreferenceRequestDto {
  @ApiProperty({ enum: digestFrequencyValues })
  @IsString()
  @IsIn(digestFrequencyValues)
  frequency!: WorkspaceDigestFrequency;
}

export class UpdateWorkspaceTelemetryConsentRequestDto {
  @ApiProperty({ enum: telemetryConsentValues })
  @IsString()
  @IsIn(telemetryConsentValues)
  consent!: WorkspaceTelemetryConsent;
}
