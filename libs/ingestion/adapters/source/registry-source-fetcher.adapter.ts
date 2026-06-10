import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  SourceFetcherPort,
  SourceProviderRegistryPort,
} from '../../ports';

export class RegistrySourceFetcherAdapter implements SourceFetcherPort {
  constructor(private readonly registry: SourceProviderRegistryPort) {}

  async fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult> {
    const provider = await this.registry.getProvider(command.providerKey);

    if (!provider) {
      throw new Error(`Source provider not registered: ${command.providerKey}`);
    }

    const validation = provider.validateBinding(command.sourceQuery);
    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    const context = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      scanJobId: command.scanJobId,
      correlationId: command.correlationId,
    };
    const plan = provider.planScan(command.sourceQuery, context);
    const result = await provider.scan(plan, context);

    return {
      items: result.items,
      nextCursor: result.nextCursor,
    };
  }
}
