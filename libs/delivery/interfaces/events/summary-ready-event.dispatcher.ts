import { DomainError } from '@social-monitor/shared-kernel';
import type { ProjectSummaryReadyEventHandler } from './project-summary-ready-event.handler';
import type { ProjectReaderSummaryReadyEventHandler } from './project-reader-summary-ready-event.handler';

export class SummaryReadyEventDispatcher {
  constructor(
    private readonly summary: Pick<ProjectSummaryReadyEventHandler, 'handle'>,
    private readonly readerSummary: Pick<ProjectReaderSummaryReadyEventHandler, 'handle'>,
  ) {}
  async handle(event: Readonly<Record<string, unknown>>): Promise<void> {
    switch (event.eventType) {
      case 'summary.ready': await this.summary.handle(event); return;
      case 'reader_summary.ready': await this.readerSummary.handle(event); return;
      default: throw new DomainError('validation.failed', 'Unsupported delivery event type');
    }
  }
}
