import type { SourceConfigReaderPort, SourceRuntimeConfig } from '@social-monitor/ingestion/ports';
import type {
  SourceBindingConfig,
  SourceBindingConfigProtectorPort,
  SourceBindingRepositoryPort,
} from '@social-monitor/monitoring/ports';

export class MonitoringSourceConfigReaderAdapter implements SourceConfigReaderPort {
  constructor(
    private readonly sourceBindings: SourceBindingRepositoryPort,
    private readonly configProtector: SourceBindingConfigProtectorPort,
  ) {}

  async readConfig(
    params: Parameters<SourceConfigReaderPort['readConfig']>[0],
  ): Promise<SourceRuntimeConfig | null> {
    const binding = await this.sourceBindings.findById(params);

    if (binding === null) {
      return null;
    }

    const config = await this.configProtector.unprotect(binding.toSnapshot().config as SourceBindingConfig);

    return toSourceRuntimeConfig(config);
  }
}

const toSourceRuntimeConfig = (config: SourceBindingConfig): SourceRuntimeConfig =>
  Object.fromEntries(Object.entries(config).map(([key, value]) => [key, value]));
