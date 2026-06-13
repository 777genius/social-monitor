import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FakeSourceProvider } from '../libs/ingestion/adapters/source/fake-source.provider';
import { FixtureHackerNewsClient } from '../libs/ingestion/adapters/source/hacker-news/fixture-hacker-news-client';
import { HackerNewsSourceProvider } from '../libs/ingestion/adapters/source/hacker-news/hacker-news-source.provider';
import { FixtureRssClient } from '../libs/ingestion/adapters/source/rss/fixture-rss-client';
import { RssSourceProvider } from '../libs/ingestion/adapters/source/rss/rss-source.provider';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import type {
  FetchedSourceItem,
  ProviderFailureKind,
  SourceCursorModel,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceQuery,
  SourceQueryMode,
} from '../libs/ingestion/ports';

const outputPath = 'ops/ingestion/source-provider-certification.json';
const update = process.argv.includes('--update');

type ProviderCase = {
  readonly providerFactory: () => SourceProviderPort;
  readonly validQuery: SourceQuery;
  readonly unsupportedQueryMode: SourceQueryMode;
  readonly expectedProviderKey: string;
  readonly expectedFailureKind: ProviderFailureKind;
};

type ProviderCertificationReport = {
  readonly providerKey: string;
  readonly readinessState: string;
  readonly productionSafe: boolean;
  readonly cursorModel: SourceCursorModel;
  readonly quotaModel: string;
  readonly itemCount: number;
  readonly warningCount: number;
  readonly firstExternalId: string;
  readonly nextCursor?: string;
  readonly repeatedScanItemCount: number;
  readonly failureKind: ProviderFailureKind;
  readonly checks: readonly string[];
};

type CertificationReport = {
  readonly schemaVersion: 1;
  readonly reportId: string;
  readonly generatedBy: string;
  readonly fixtureMode: 'deterministic_no_network';
  readonly blockingPassed: boolean;
  readonly certifiedProviders: readonly ProviderCertificationReport[];
  readonly deferredProviders: readonly {
    readonly providerKey: string;
    readonly state: string;
    readonly acquisitionMode: string;
  }[];
};

const cases: readonly ProviderCase[] = [
  {
    providerFactory: () => new FakeSourceProvider(),
    validQuery: { mode: 'search', query: 'monitoring' },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: 'fake-source',
    expectedFailureKind: 'unknown',
  },
  {
    providerFactory: () => new HackerNewsSourceProvider(new FixtureHackerNewsClient()),
    validQuery: { mode: 'search', query: 'monitoring' },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: 'hacker-news',
    expectedFailureKind: 'unavailable',
  },
  {
    providerFactory: () => new RssSourceProvider(new FixtureRssClient()),
    validQuery: { mode: 'url', query: 'https://example.test/feed.xml' },
    unsupportedQueryMode: 'thread',
    expectedProviderKey: 'rss',
    expectedFailureKind: 'unavailable',
  },
];

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main(): Promise<void> {
  const readinessByProvider = new Map(sourceReadinessProfiles.map((profile) => [profile.providerKey, profile]));
  const enabledBetaProfiles = sourceReadinessProfiles.filter((profile) => profile.state === 'enabled_beta');
  const caseKeys = new Set(cases.map((providerCase) => providerCase.expectedProviderKey));

  assert(
    enabledBetaProfiles.every((profile) => caseKeys.has(profile.providerKey)),
    `Every enabled_beta provider must have certification case. Enabled: ${enabledBetaProfiles
      .map((profile) => profile.providerKey)
      .join(', ')}`,
  );

  const certifiedProviders = await Promise.all(
    cases.map((providerCase) => certifyProvider(providerCase, readinessByProvider)),
  );
  const deferredProviders = sourceReadinessProfiles
    .filter((profile) => profile.state !== 'enabled_beta')
    .map((profile) => ({
      providerKey: profile.providerKey,
      state: profile.state,
      acquisitionMode: profile.acquisitionMode,
    }))
    .sort((left, right) => left.providerKey.localeCompare(right.providerKey));
  const report: CertificationReport = {
    schemaVersion: 1,
    reportId: 'source-provider-certification-mvp-v1',
    generatedBy: 'npm run check:source-certification',
    fixtureMode: 'deterministic_no_network',
    blockingPassed: true,
    certifiedProviders: certifiedProviders.sort((left, right) => left.providerKey.localeCompare(right.providerKey)),
    deferredProviders,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;

  if (update) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized);
    console.log(`Updated ${outputPath}`);
    return;
  }

  if (!existsSync(outputPath)) {
    throw new Error(`${outputPath} is missing. Run npm run check:source-certification -- --update`);
  }

  const expected = readFileSync(outputPath, 'utf8');
  if (expected !== serialized) {
    throw new Error(`${outputPath} is stale. Run npm run check:source-certification -- --update`);
  }

  console.log(`Source provider certification OK (${report.certifiedProviders.length} providers)`);
}

async function certifyProvider(
  providerCase: ProviderCase,
  readinessByProvider: ReadonlyMap<string, (typeof sourceReadinessProfiles)[number]>,
): Promise<ProviderCertificationReport> {
  const provider = providerCase.providerFactory();
  const profile = provider.capabilityProfile();
  const readiness = readinessByProvider.get(providerCase.expectedProviderKey);
  const context = makeContext(providerCase.expectedProviderKey);
  const validation = provider.validateBinding(providerCase.validQuery);
  const unsupportedValidation = provider.validateBinding({
    ...providerCase.validQuery,
    mode: providerCase.unsupportedQueryMode,
  });

  assert(provider.key() === providerCase.expectedProviderKey, `${providerCase.expectedProviderKey}: key mismatch`);
  assert(profile.providerKey === providerCase.expectedProviderKey, `${providerCase.expectedProviderKey}: profile key mismatch`);
  assert(readiness !== undefined, `${providerCase.expectedProviderKey}: missing source readiness profile`);
  assert(readiness.state === 'enabled_beta', `${providerCase.expectedProviderKey}: readiness profile must be enabled_beta`);
  assert(profile.productionSafe === true, `${providerCase.expectedProviderKey}: provider must be productionSafe for beta`);
  assert(profile.displayName.trim().length > 0, `${providerCase.expectedProviderKey}: displayName is required`);
  assert(profile.version >= 1, `${providerCase.expectedProviderKey}: version must be >= 1`);
  assert(profile.cursorModel === readiness.cursorModel, `${providerCase.expectedProviderKey}: cursor model mismatch`);
  assert(profile.quotaModel === readiness.quotaModel, `${providerCase.expectedProviderKey}: quota model mismatch`);
  assertArrayIncludesAll(profile.supportedContentUnits, readiness.supportedContentUnits, `${providerCase.expectedProviderKey}: content units`);
  assertArrayIntersects(profile.stableIdentity, readiness.identityStrategy, `${providerCase.expectedProviderKey}: identity strategy`);
  assert(
    readiness.betaEnablementCriteria.some((criterion) => criterion.toLowerCase().includes('certification')),
    `${providerCase.expectedProviderKey}: beta criteria must mention certification`,
  );
  assert(validation.ok, `${providerCase.expectedProviderKey}: valid query was rejected`);
  assert(!unsupportedValidation.ok, `${providerCase.expectedProviderKey}: unsupported query mode was accepted`);

  const plan = provider.planScan(providerCase.validQuery, context);
  assert(plan.maxItems > 0 && plan.maxItems <= 100, `${providerCase.expectedProviderKey}: maxItems must be bounded`);
  assert(plan.query.mode === providerCase.validQuery.mode, `${providerCase.expectedProviderKey}: plan mode mismatch`);
  assert(plan.query.query === providerCase.validQuery.query, `${providerCase.expectedProviderKey}: plan query mismatch`);

  const result = await provider.scan(plan, context);
  assert(result.items.length > 0, `${providerCase.expectedProviderKey}: fixture scan must return items`);
  assertStableItems(providerCase.expectedProviderKey, result.items, { allowEmpty: false });

  if (profile.cursorModel !== 'none') {
    assert(
      result.nextCursor !== undefined && result.nextCursor.trim().length > 0,
      `${providerCase.expectedProviderKey}: cursor model ${profile.cursorModel} must return nextCursor`,
    );
  }

  const repeatedResult = await provider.scan({ ...plan, cursor: result.nextCursor }, context);
  assertStableItems(providerCase.expectedProviderKey, repeatedResult.items, { allowEmpty: true });
  assert(
    repeatedResult.nextCursor === undefined || repeatedResult.nextCursor.trim().length > 0,
    `${providerCase.expectedProviderKey}: repeated scan cursor must be undefined or non-empty`,
  );

  const failure = provider.classifyError(new Error('fixture provider failure'), context);
  assert(failure.kind === providerCase.expectedFailureKind, `${providerCase.expectedProviderKey}: failure kind mismatch`);
  assert(failure.message.trim().length > 0, `${providerCase.expectedProviderKey}: failure message is required`);
  assert(typeof failure.retryable === 'boolean', `${providerCase.expectedProviderKey}: retryable flag is required`);

  return {
    providerKey: providerCase.expectedProviderKey,
    readinessState: readiness.state,
    productionSafe: profile.productionSafe,
    cursorModel: profile.cursorModel,
    quotaModel: profile.quotaModel,
    itemCount: result.items.length,
    warningCount: result.warnings.length,
    firstExternalId: result.items[0]?.externalId ?? '',
    nextCursor: result.nextCursor,
    repeatedScanItemCount: repeatedResult.items.length,
    failureKind: failure.kind,
    checks: [
      'capability_profile_matches_readiness',
      'unsupported_query_rejected_before_scan',
      'normalized_items_have_stable_identity',
      'cursor_contract_is_non_empty_for_cursor_models',
      'fixture_repeated_scan_is_deterministic',
      'provider_errors_are_classified',
    ],
  };
}

function makeContext(providerKey: string): SourceProviderScanContext {
  return {
    tenantId: tenantId(`tenant-cert-${providerKey}`),
    workspaceId: workspaceId(`workspace-cert-${providerKey}`),
    sourceBindingId: `source-binding-cert-${providerKey}`,
    scanJobId: `scan-job-cert-${providerKey}`,
    correlationId: `correlation-cert-${providerKey}`,
  };
}

function assertStableItems(
  providerKey: string,
  items: readonly FetchedSourceItem[],
  options: { readonly allowEmpty: boolean },
): void {
  const externalIds = new Set<string>();
  const canonicalUrls = new Set<string>();

  for (const item of items) {
    assert(item.externalId.trim().length > 0, `${providerKey}: item externalId is required`);
    assert(!externalIds.has(item.externalId), `${providerKey}: duplicate externalId ${item.externalId}`);
    externalIds.add(item.externalId);

    assert(item.canonicalUrl.trim().length > 0, `${providerKey}: item canonicalUrl is required`);
    assert(isHttpUrl(item.canonicalUrl), `${providerKey}: item canonicalUrl must be http(s): ${item.canonicalUrl}`);
    canonicalUrls.add(item.canonicalUrl);

    assert(item.title.trim().length + item.body.trim().length > 0, `${providerKey}: item title/body are both empty`);
    assert(item.publishedAt instanceof Date, `${providerKey}: item publishedAt must be a Date`);
    assert(!Number.isNaN(item.publishedAt.getTime()), `${providerKey}: item publishedAt must be valid`);
  }

  if (!options.allowEmpty) {
    assert(canonicalUrls.size > 0, `${providerKey}: at least one canonical URL is required`);
  }
}

function assertArrayIncludesAll(actual: readonly string[], expected: readonly string[], label: string): void {
  for (const expectedValue of expected) {
    assert(actual.includes(expectedValue), `${label}: missing ${expectedValue}`);
  }
}

function assertArrayIntersects(left: readonly string[], right: readonly string[], label: string): void {
  assert(left.some((value) => right.includes(value)), `${label}: no shared value`);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
