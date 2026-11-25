import type { Clock } from "@social-monitor/shared-kernel";
import type {
  SourceConfigReaderPort,
  SourceQuery,
  SourceRuntimeConfig,
} from "@social-monitor/ingestion/ports";

type SourceConfigTarget = {
  readonly sourceBindingId: string;
  readonly providerKey?: string;
  readonly config: SourceRuntimeConfig;
};

export class CleanRealDaySourceConfigReader implements SourceConfigReaderPort {
  private readonly targetsByBinding = new Map<string, SourceConfigTarget>();

  constructor(targets: readonly SourceConfigTarget[], private readonly clock?: Clock) {
    for (const target of targets) {
      this.targetsByBinding.set(target.sourceBindingId, target);
    }
  }

  async readConfig(params: {
    readonly sourceBindingId: string;
  }): Promise<SourceRuntimeConfig | null> {
    const target = this.targetsByBinding.get(params.sourceBindingId);
    if (target === undefined) return null;
    const window = target.config.targetPublishedWindow;
    if (this.clock === undefined || target.providerKey !== "reddit" ||
        typeof window !== "object" || window === null || Array.isArray(window)) {
      return target.config;
    }
    return { ...target.config, targetPublishedWindow: { ...window, observedAt: this.clock.now().toISOString() } };
  }
}

/** Let the per-attempt reader own Reddit's observation time during registry merges. */
export const cleanDaySourceQuery = (providerKey: string, query: SourceQuery): SourceQuery => {
  if (providerKey !== "reddit" || query.parameters?.targetPublishedWindow === undefined) return query;
  return { ...query, parameters: Object.fromEntries(
    Object.entries(query.parameters).filter(([key]) => key !== "targetPublishedWindow"),
  ) };
};
