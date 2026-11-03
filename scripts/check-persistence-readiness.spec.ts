import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkPersistenceReadiness } from './check-persistence-readiness';
import { discoverCompositionInventory } from './lib/persistence-composition-inventory';

const moduleFile = 'apps/fixture/src/fixture.module.ts';
const providerFile = 'apps/fixture/src/fixture.providers.ts';
const adapterFile = 'libs/fixture/adapters/memory.ts';
const moduleSource = "import { providers } from './fixture.providers'; export const fixture = { providers };";
const providerSource = "import { InMemoryFixtureRepository } from '../../../libs/fixture/adapters/memory'; export const providers = [{ provide: 'repo', useClass: InMemoryFixtureRepository }];";
const adapterSource = 'export class InMemoryFixtureRepository {}';
const moduleDeclaration = (sources: readonly string[] = [], adapters = ['InMemoryFixtureRepository'], root = moduleFile) => ({
  moduleFile: root, adapterSourceFiles: sources, inMemoryStateAdapters: adapters,
  context: 'fixture', owner: 'fixture-owner', risk: 'process-local fixture state',
  durableReplacementPlan: 'fixture durable replacement',
});
const noopDeclaration = (root = moduleFile) => ({
  moduleFile: root, adapter: 'NoopFixtureAdapter', owner: 'fixture-owner', risk: 'fixture disabled',
  durableReplacementPlan: 'fixture durable replacement',
});
type FixtureOptions = {
  readonly files?: Readonly<Record<string, string>>;
  readonly modules?: readonly ReturnType<typeof moduleDeclaration>[];
  readonly noops?: readonly ReturnType<typeof noopDeclaration>[];
  readonly paths?: Readonly<Record<string, readonly string[]>>;
};

function withFixture<T>(options: FixtureOptions, run: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), 'persistence-readiness-'));
  try {
    const files = {
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: options.paths ?? {} } }),
      'package.json': JSON.stringify({ scripts: { verify: 'npm run check:persistence-readiness' } }),
      'ops/release/persistence-readiness-contract.json': JSON.stringify({
        schemaVersion: 1, posture: 'durability_gap_declared',
        mvpRuntimeDecision: {
          blocksExternalBeta: true, allowedRuntime: 'durable_beta_profile', owner: 'fixture-owner',
          exitCriteria: ['durable storage', 'durable transport', 'deployed evidence'],
        },
        runtimeModules: options.modules ?? [], runtimeNoopAdapters: options.noops ?? [],
      }),
      [adapterFile]: adapterSource,
      ...options.files,
    };
    for (const [path, content] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const check = (options: FixtureOptions): readonly string[] => withFixture(options, checkPersistenceReadiness);

describe('persistence readiness composition discovery', () => {
  it.each([
    'InMemoryScanExecutionAttemptReadModel',
    'InMemoryInterestCreationState',
    'InMemoryReaderSummaryPublication',
    'InMemoryReaderSummaryReadyProjectionStore',
    'InMemorySummaryReadyProjectionStore',
  ])('requires an explicit declaration for business state role %s', (adapter) => {
    const files = {
      [moduleFile]: moduleSource,
      [providerFile]: providerSource.replaceAll('InMemoryFixtureRepository', adapter),
      [adapterFile]: `export class ${adapter} {}`,
    };
    expect(check({ files }).join('\n')).toContain(adapter);
    expect(check({ files, modules: [moduleDeclaration([providerFile], [adapter])] })).toEqual([]);
  });

  it('excludes metric observations, configured registries and delegates without separate state', () => {
    const adapters = [
      'InMemoryMetricsRecorder', 'InMemorySourceProviderRegistry',
      'InMemoryInterestCreationStore', 'InMemorySourceBindingCreationStore',
      'InMemorySourceBindingStatusChangeStore', 'InMemoryRelevanceFeedbackLearningStore',
      'InMemoryFeedProjectionAdapter',
    ];
    const files = {
      [moduleFile]: moduleSource,
      [providerFile]: `import { ${adapters.join(', ')} } from '../../../libs/fixture/adapters/memory'; export const providers = [${adapters.join(', ')}];`,
      [adapterFile]: adapters.map((adapter) => `export class ${adapter} {}`).join('\n'),
    };
    expect(check({ files })).toEqual([]);
  });

  it('accepts declared direct adapters and keeps missing inventory fail-closed', () => {
    const files = { [moduleFile]: providerSource };
    expect(check({ files, modules: [moduleDeclaration()] })).toEqual([]);
    expect(check({ files }).join('\n')).toContain('stateful in-memory runtime adapters are not declared');
  });

  it('discovers an imported provider independently of both module and source declarations', () => {
    const files = { [moduleFile]: moduleSource, [providerFile]: providerSource };
    expect(check({ files }).join('\n')).toContain('InMemoryFixtureRepository');
    expect(check({ files, modules: [moduleDeclaration()] }).join('\n')).toContain('missing adapterSourceFiles declaration');
    expect(check({ files, modules: [moduleDeclaration([providerFile])] })).toEqual([]);
  });

  it('finds a noop inside an already declared provider file', () => {
    const files = {
      [moduleFile]: moduleSource,
      [providerFile]: `${providerSource.replace('useClass: InMemoryFixtureRepository', 'useFactory: () => [new InMemoryFixtureRepository(), new NoopFixtureAdapter()]')}\nclass NoopFixtureAdapter {}`,
    };
    const modules = [moduleDeclaration([providerFile])];
    expect(check({ files, modules }).join('\n')).toContain('runtime noop adapter "NoopFixtureAdapter"');
    expect(check({ files, modules, noops: [noopDeclaration()] })).toEqual([]);
  });

  it('follows configured aliases and runtime re-exports through adapter composition', () => {
    const composition = 'apps/fixture/src/adapters/composition';
    const source = `${composition}/wiring.ts`;
    const files = {
      [moduleFile]: "import { providers } from '@fixture/wiring'; export const fixture = { providers };",
      [`${composition}/index.ts`]: "export { providers } from './wiring';",
      [source]: "import { InMemoryFixtureRepository as LocalRepository } from '../../../../../libs/fixture/adapters/memory'; export const providers = [{ provide: 'repo', useClass: LocalRepository }];",
    };
    expect(check({ files, modules: [moduleDeclaration([source])], paths: { '@fixture/wiring': [`${composition}/index.ts`] } })).toEqual([]);
  });

  it('recognizes provider wiring by syntax even with an arbitrary local filename', () => {
    const wiring = 'apps/fixture/src/wiring.ts';
    expect(check({
      files: { [moduleFile]: moduleSource.replace('./fixture.providers', './wiring'), [wiring]: providerSource },
      modules: [moduleDeclaration([wiring])],
    })).toEqual([]);
  });

  it('recognizes bare class provider arrays without a filename convention', () => {
    const wiring = 'apps/fixture/src/assembly.ts';
    const files = {
      [moduleFile]: moduleSource.replace('./fixture.providers', './assembly'),
      [wiring]: providerSource.replace("[{ provide: 'repo', useClass: InMemoryFixtureRepository }]", '[InMemoryFixtureRepository]'),
    };
    expect(check({ files, modules: [moduleDeclaration([wiring])] })).toEqual([]);
  });

  it('ignores comments, strings, type-only edges and test fixtures', () => {
    const files = {
      [moduleFile]: `
        import type { InMemoryGhostRepository } from './missing.providers';
        export type { NoopGhostAdapter } from './other-missing.providers';
        import { type InMemoryAnotherRepository } from './typed.providers';
        import { InMemoryFixtureRepository } from '../../../libs/fixture/adapters/memory';
        type Shape = InMemoryFixtureRepository;
        import './fake.providers.spec';
        // new InMemoryCommentRepository()
        export const description = 'NoopQuotedAdapter';
      `,
      'apps/fixture/src/fake.providers.spec.ts': 'export const providers = [new InMemoryFixtureRepository()];',
    };
    expect(check({ files })).toEqual([]);
  });

  it('stops at concrete adapter implementations and other module boundaries', () => {
    const files = {
      [moduleFile]: providerSource,
      [adapterFile]: "import { other } from './nested'; export class InMemoryFixtureRepository { value = other; }",
      'libs/fixture/adapters/nested.ts': 'export class InMemoryHiddenRepository {} export const other = new InMemoryHiddenRepository();',
      'apps/fixture/src/other.module.ts': 'export const other = {};',
    };
    const inventory = withFixture({ files }, discoverCompositionInventory);
    expect(inventory.modules.find((entry) => entry.moduleFile === moduleFile)?.sources).toEqual([moduleFile]);
    expect(check({ files, modules: [moduleDeclaration()] })).toEqual([]);
  });

  it('reports unresolved runtime wiring imports but not missing type-only imports', () => {
    expect(check({ files: { [moduleFile]: "export { providers } from './missing.providers';" } }).join('\n'))
      .toContain('unresolved runtime composition import "./missing.providers"');
    expect(check({ files: { [moduleFile]: "import { providers } from '@fixture/missing'; export const fixture = { providers };" }, paths: { '@fixture/*': ['apps/fixture/src/*'] } }).join('\n'))
      .toContain('unresolved runtime composition import "@fixture/missing"');
  });

  it('rejects stale source, adapter, and noop declarations', () => {
    const files = { [moduleFile]: 'export const fixture = {};', [providerFile]: providerSource };
    const errors = check({ files, modules: [moduleDeclaration([providerFile])], noops: [noopDeclaration()] }).join('\n');
    expect(errors).toContain('stale adapter source');
    expect(errors).toContain('declares stale adapters');
    expect(errors).toContain('stale noop adapter declaration');
  });

  it('inventories shared wiring separately for each independently discovered module root', () => {
    const secondModule = 'apps/fixture/src/second.module.ts';
    const files = { [moduleFile]: moduleSource, [secondModule]: moduleSource, [providerFile]: providerSource };
    expect(check({ files, modules: [moduleDeclaration([providerFile]), moduleDeclaration([providerFile], undefined, secondModule)] })).toEqual([]);
    expect(check({ files, modules: [moduleDeclaration([providerFile])] }).join('\n')).toContain(`${secondModule}: stateful`);
  });

  it('does not count unused provider exports when a module imports only configuration', () => {
    const files = {
      [moduleFile]: "import { options } from './fixture.providers'; export const fixture = { options };",
      [providerFile]: `${providerSource}\nexport const options = { durable: true };`,
    };
    expect(check({ files })).toEqual([]);
  });

  it('handles provider re-export cycles without abandoning the adapter inventory', () => {
    const files = {
      [moduleFile]: "import { providers } from './index'; export const fixture = { providers };",
      'apps/fixture/src/index.ts': "export { providers } from './fixture.providers';",
      [providerFile]: `${providerSource}\nexport * from './index';`,
    };
    expect(check({ files, modules: [moduleDeclaration([providerFile])] })).toEqual([]);
  });

  it('follows anonymous default provider factories', () => {
    const files = {
      [moduleFile]: "import createProviders from './fixture.providers'; export const fixture = { providers: createProviders() };",
      [providerFile]: "import { InMemoryFixtureRepository } from '../../../libs/fixture/adapters/memory'; export default function () { return [InMemoryFixtureRepository]; }",
    };
    expect(check({ files }).join('\n')).toContain('InMemoryFixtureRepository');
    expect(check({ files, modules: [moduleDeclaration([providerFile])] })).toEqual([]);
  });

  it('follows namespace re-exports through local barrels', () => {
    const files = {
      [moduleFile]: "import { wiring } from './index'; export const fixture = { providers: wiring.providers };",
      'apps/fixture/src/index.ts': "export * as wiring from './fixture.providers';",
      [providerFile]: providerSource,
    };
    expect(check({ files }).join('\n')).toContain('InMemoryFixtureRepository');
    expect(check({ files, modules: [moduleDeclaration([providerFile])] })).toEqual([]);
  });
});
