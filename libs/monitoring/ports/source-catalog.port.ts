export type SourceCapabilityProfile = {
  readonly providerKey: string;
  readonly version: number;
  readonly productionSafe: boolean;
  readonly supportsCursor: boolean;
};

export interface SourceCatalogPort {
  getCapability(providerKey: string): Promise<SourceCapabilityProfile | null>;
}
