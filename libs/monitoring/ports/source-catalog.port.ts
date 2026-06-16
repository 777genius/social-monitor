import type { SourceBindingConfig } from './source-binding-config-protector.port';

export type SourceCapabilityProfile = {
  readonly providerKey: string;
  readonly version: number;
  readonly productionSafe: boolean;
  readonly supportsCursor: boolean;
};

export type SourceBindingConfigValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export interface SourceCatalogPort {
  getCapability(providerKey: string): Promise<SourceCapabilityProfile | null>;
  validateBindingConfig(
    providerKey: string,
    config: SourceBindingConfig,
  ): Promise<SourceBindingConfigValidationResult>;
}
