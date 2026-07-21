import type {
  SourceConfigReaderPort,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";

type SourceConfigTarget = {
  readonly sourceBindingId: string;
  readonly config: SourceRuntimeConfig;
};

export class CleanRealDaySourceConfigReader implements SourceConfigReaderPort {
  private readonly configByBinding = new Map<string, SourceRuntimeConfig>();

  constructor(targets: readonly SourceConfigTarget[]) {
    for (const target of targets) {
      this.configByBinding.set(target.sourceBindingId, target.config);
    }
  }

  async readConfig(params: {
    readonly sourceBindingId: string;
  }): Promise<SourceRuntimeConfig | null> {
    return this.configByBinding.get(params.sourceBindingId) ?? null;
  }
}
