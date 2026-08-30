import { Injectable } from '@nestjs/common';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import { ListReaderSummaryPeriodsUseCase } from '@social-monitor/summary/features/list-reader-summary-periods/list-reader-summary-periods.use-case';
import { ListReaderSummariesUseCase } from '@social-monitor/summary/features/list-reader-summaries/list-reader-summaries.use-case';
import {
  listReaderSummariesResponseFromReaderSummaries,
  listReaderSummaryPeriodsResponseFromReaderSummaryPeriods,
} from '@social-monitor/summary/interfaces/rest/reader-summary-rest.mapper';

import { AppBootstrapReaderSummaryCache } from './app-bootstrap-reader-summary-cache';
import type { ReaderSummaryBootstrapResponseDto } from './app-bootstrap.dto';

const INITIAL_READER_SUMMARY_PERIOD_LIMIT = 40;

@Injectable()
export class AppBootstrapReaderSummaryQuery {
  constructor(
    private readonly listReaderSummaries: ListReaderSummariesUseCase,
    private readonly listReaderSummaryPeriods: ListReaderSummaryPeriodsUseCase,
    private readonly cache: AppBootstrapReaderSummaryCache,
  ) {}

  execute(input: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
  }): Promise<ReaderSummaryBootstrapResponseDto> {
    const { tenantId, workspaceId } = input;
    return this.cache.getOrLoad(tenantId, workspaceId, async () => {
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
        tenantId,
        workspaceId,
        latest: listReaderSummariesResponseFromReaderSummaries(
          latestResult.value,
        ),
        periods: listReaderSummaryPeriodsResponseFromReaderSummaryPeriods(
          periodsResult.value,
        ),
      };
    });
  }
}
