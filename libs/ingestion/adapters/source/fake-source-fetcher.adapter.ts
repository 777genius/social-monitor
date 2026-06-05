import type { FetchSourceItemsCommand, FetchedSourceItem, SourceFetcherPort } from '../../ports';
import { FakeSourceProvider } from './fake-source.provider';

export class FakeSourceFetcherAdapter implements SourceFetcherPort {
  private readonly provider = new FakeSourceProvider();

  async fetch(command: FetchSourceItemsCommand): Promise<readonly FetchedSourceItem[]> {
    const query = {
      mode: 'search' as const,
      query: command.sourceBindingId,
    };
    const validation = this.provider.validateBinding(query);

    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    const context = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      scanJobId: command.scanJobId,
      correlationId: command.scanJobId,
    };
    const plan = this.provider.planScan(query, context);
    const result = await this.provider.scan(plan, context);

    return result.items;
  }
}
