import type {
  FetchSourceItemsCommand,
  FetchedSourceItem,
  SourceFetcherPort,
  SourceProviderRegistryPort,
} from '../../ports';

export class FakeSourceFetcherAdapter implements SourceFetcherPort {
  constructor(private readonly registry: SourceProviderRegistryPort) {}

  async fetch(command: FetchSourceItemsCommand): Promise<readonly FetchedSourceItem[]> {
    const provider = await this.registry.getProvider('fake-source');

    if (!provider) {
      throw new Error('Source provider not registered: fake-source');
    }

    const query = {
      mode: 'search' as const,
      query: command.sourceBindingId,
    };
    const validation = provider.validateBinding(query);

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
    const plan = provider.planScan(query, context);
    const result = await provider.scan(plan, context);

    return result.items;
  }
}
