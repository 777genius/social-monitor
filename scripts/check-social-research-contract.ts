import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  buildSocialResearchContract,
  buildSocialResearchLanguageSdkConformanceSuite,
  buildSocialResearchLanguageSdkManifest,
  buildSocialResearchLanguageSdkRunnerContract,
  buildSocialResearchSdkCases,
  buildSocialResearchSdkConformance,
  buildSocialResearchTypescriptSdkConformanceReport,
} from '@social-monitor/social-research/contracts';

const update = process.argv.includes('--update');

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  const artifacts = await buildArtifacts();

  if (update) {
    for (const artifact of artifacts) {
      mkdirSync(dirname(artifact.path), { recursive: true });
      writeFileSync(artifact.path, serializedArtifact(artifact.value));
      console.log(`Updated ${artifact.path}`);
    }
    return;
  }

  for (const artifact of artifacts) {
    if (!existsSync(artifact.path)) {
      console.error(`${artifact.path} is missing. Run npm run check:social-research-contract -- --update`);
      process.exit(1);
    }

    const current = readFileSync(artifact.path, 'utf8');
    if (current !== serializedArtifact(artifact.value)) {
      console.error(`${artifact.path} is stale. Run npm run check:social-research-contract -- --update`);
      process.exit(1);
    }
  }

  console.log('Social research contract OK');
}

async function buildArtifacts(): Promise<
  readonly { readonly path: string; readonly value: unknown }[]
> {
  return [
    {
      path: 'libs/contracts/social-research/social-research.contract.json',
      value: buildSocialResearchContract(),
    },
    {
      path: 'libs/contracts/social-research/social-research.sdk-cases.json',
      value: buildSocialResearchSdkCases(),
    },
    {
      path: 'libs/contracts/social-research/social-research.sdk-conformance.json',
      value: buildSocialResearchSdkConformance(),
    },
    {
      path: 'libs/contracts/social-research/social-research.language-sdk-manifest.json',
      value: buildSocialResearchLanguageSdkManifest(),
    },
    {
      path: 'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
      value: buildSocialResearchLanguageSdkConformanceSuite(),
    },
    {
      path: 'libs/contracts/social-research/social-research.language-sdk-runner-contract.json',
      value: buildSocialResearchLanguageSdkRunnerContract(),
    },
    {
      path: 'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json',
      value: await buildSocialResearchTypescriptSdkConformanceReport(),
    },
  ];
}

function serializedArtifact(value: unknown): string {
  return `${stableStringify(value)}\n`;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)]),
    );
  }

  return value;
}
