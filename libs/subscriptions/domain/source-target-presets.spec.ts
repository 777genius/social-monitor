import { StaticSourceTargetCatalogAdapter } from '../adapters/target-catalog/static-source-target-catalog.adapter';
import { aiDeveloperSignalSourcePreset } from './source-target-presets';

describe('aiDeveloperSignalSourcePreset', () => {
  it('contains valid source targets for the subscription catalog', () => {
    const catalog = new StaticSourceTargetCatalogAdapter();

    expect(aiDeveloperSignalSourcePreset.entries).toHaveLength(24);
    for (const entry of aiDeveloperSignalSourcePreset.entries) {
      expect(catalog.validateTarget({
        providerKey: entry.providerKey,
        targetKind: entry.targetKind,
        targetValue: entry.targetValue,
        config: entry.targetConfig,
      })).toMatchObject({ ok: true });
    }
  });
});
