import { Controller, Get, Headers } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetAuthSessionUseCase } from '@social-monitor/identity/features/get-auth-session/get-auth-session.use-case';
import { parseBearerToken } from '@social-monitor/identity/interfaces/authorization/bearer-authorization';
import { ListReaderSummaryPeriodsUseCase } from '@social-monitor/summary/features/list-reader-summary-periods/list-reader-summary-periods.use-case';
import { ListReaderSummariesUseCase } from '@social-monitor/summary/features/list-reader-summaries/list-reader-summaries.use-case';
import {
  listReaderSummariesResponseFromReaderSummaries,
  listReaderSummaryPeriodsResponseFromReaderSummaryPeriods,
} from '@social-monitor/summary/interfaces/rest/reader-summary-rest.mapper';

import { AppBootstrapResponseDto } from './app-bootstrap.dto';

const INITIAL_READER_SUMMARY_PERIOD_LIMIT = 40;

@ApiTags('app-bootstrap')
@Controller('app/bootstrap')
export class AppBootstrapController {
  constructor(
    private readonly getAuthSession: GetAuthSessionUseCase,
    private readonly listReaderSummaries: ListReaderSummariesUseCase,
    private readonly listReaderSummaryPeriods: ListReaderSummaryPeriodsUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Restore the session and initial daily reader-summary data in one request.',
  })
  @ApiHeader({
    name: 'authorization',
    required: false,
    description: 'Bearer OIDC JWT user session token.',
  })
  @ApiOkResponse({ type: AppBootstrapResponseDto })
  async get(
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<AppBootstrapResponseDto> {
    const sessionResult = await this.getAuthSession.execute({
      accessToken: parseBearerToken(authorizationHeader),
    });
    if (!sessionResult.ok) {
      throw sessionResult.error;
    }

    const session = sessionResult.value;
    const { tenantId, workspaceId } = session.selectedWorkspace;
    const scope = { type: 'workspace' } as const;
    const [latestResult, periodsResult] = await Promise.all([
      this.listReaderSummaries.execute({
        tenantId,
        workspaceId,
        scope,
        cadence: 'daily',
        timezone: 'UTC',
        limit: 1,
      }),
      this.listReaderSummaryPeriods.execute({
        tenantId,
        workspaceId,
        scope,
        cadence: 'daily',
        timezone: 'UTC',
        limit: INITIAL_READER_SUMMARY_PERIOD_LIMIT,
      }),
    ]);

    if (!latestResult.ok) {
      throw latestResult.error;
    }
    if (!periodsResult.ok) {
      throw periodsResult.error;
    }

    return {
      session,
      readerSummaries: {
        tenantId,
        workspaceId,
        latest: listReaderSummariesResponseFromReaderSummaries(
          latestResult.value,
        ),
        periods: listReaderSummaryPeriodsResponseFromReaderSummaryPeriods(
          periodsResult.value,
        ),
      },
    };
  }
}
