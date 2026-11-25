import type {
  FetchSourceItemsCommand,
  FetchSourceItemsResult,
  SourceFetcherPort,
  SourceProviderRegistryPort,
} from '../../ports';
import { RegistrySourceFetcherAdapter } from './registry-source-fetcher.adapter';

export class FakeSourceFetcherAdapter implements SourceFetcherPort {
  private readonly delegate: RegistrySourceFetcherAdapter;

  constructor(registry: SourceProviderRegistryPort) {
    this.delegate = new RegistrySourceFetcherAdapter(registry);
  }

  async fetch(command: FetchSourceItemsCommand): Promise<FetchSourceItemsResult> {
    return this.delegate.fetch(command);
  }
}
