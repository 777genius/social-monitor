import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  SourceConfigReaderPort,
  SourceFetcherPort,
  SourceProviderScanContext,
  SourceProviderRegistryPort,
} from '../../ports';
import { SourceFetchError } from '../../ports';

export class RegistrySourceFetcherAdapter implements SourceFetcherPort {
  constructor(
    private readonly registry: SourceProviderRegistryPort,
    private readonly sourceConfigs?: SourceConfigReaderPort,
  ) {}

  async fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult> {
    const provider = await this.registry.getProvider(command.providerKey);

    if (!provider) {
      throw new Error(`Source provider not registered: ${command.providerKey}`);
    }

    const validation = provider.validateBinding(command.sourceQuery);
    if (!validation.ok) {
      throw new SourceFetchError({
        providerKey: command.providerKey,
        kind: 'invalid_query',
        retryable: false,
        message: validation.reason,
      });
    }

    const context = await this.buildContext(command);

    try {
      const plan = {
        ...provider.planScan(command.sourceQuery, context),
        cursor: command.cursor,
      };
      const result = await provider.scan(plan, context);

      return {
        items: result.items,
        nextCursor: result.nextCursor,
      };
    } catch (error) {
      const failure = provider.classifyError(error, context);

      throw new SourceFetchError({
        providerKey: provider.key(),
        kind: failure.kind,
        retryable: failure.retryable,
        message: failure.message,
        retryAfterMs: failure.retryAfterMs,
        rateLimitResetAt: failure.rateLimitResetAt,
      });
    }
  }

  private async buildContext(command: FetchSourceItemsCommand): Promise<SourceProviderScanContext> {
    const baseContext = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
      scanJobId: command.scanJobId,
      correlationId: command.correlationId,
    };
    const config = await this.sourceConfigs?.readConfig({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      sourceBindingId: command.sourceBindingId,
    });

    return config === undefined || config === null
      ? baseContext
      : { ...baseContext, config };
  }
}
