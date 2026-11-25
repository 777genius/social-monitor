import { ApiProperty } from '@nestjs/swagger';
import { AuthSessionResponseDto } from '@social-monitor/identity/interfaces/rest/auth-session.dto';
import {
  ListReaderSummariesResponseDto,
  ListReaderSummaryPeriodsResponseDto,
} from '@social-monitor/summary/interfaces/rest/reader-summary.dto';

export class ReaderSummaryBootstrapResponseDto {
  @ApiProperty()
  declare readonly tenantId: string;

  @ApiProperty()
  declare readonly workspaceId: string;

  @ApiProperty({ type: () => ListReaderSummariesResponseDto })
  declare readonly latest: ListReaderSummariesResponseDto;

  @ApiProperty({ type: () => ListReaderSummaryPeriodsResponseDto })
  declare readonly periods: ListReaderSummaryPeriodsResponseDto;
}

export class AppBootstrapResponseDto {
  @ApiProperty({ type: () => AuthSessionResponseDto })
  declare readonly session: AuthSessionResponseDto;

  @ApiProperty({ type: () => ReaderSummaryBootstrapResponseDto })
  declare readonly readerSummaries: ReaderSummaryBootstrapResponseDto;
}
