import type {
  GitHubRepositoryLiveRecord,
  GitHubRepositoryLiveVerificationRequest,
  GitHubRepositoryLiveVerifierPort,
} from './github-repository-live-verifier.port';

const fixtureRepositories = new Map<string, GitHubRepositoryLiveRecord>([
  ['openai/codex', {
    fullName: 'openai/codex',
    url: 'https://github.com/openai/codex',
    description: 'AI coding agent CLI and developer workflow tooling.',
    language: 'TypeScript',
    topics: ['ai', 'agents', 'developer-tools'],
    license: 'Apache-2.0',
    totalStars: 54000,
    fork: false,
    archived: false,
    pushedAt: new Date('2026-06-23T08:00:00.000Z'),
    updatedAt: new Date('2026-06-23T08:30:00.000Z'),
  }],
  ['astral-sh/uv', {
    fullName: 'astral-sh/uv',
    url: 'https://github.com/astral-sh/uv',
    description: 'Fast Python package and project manager written in Rust.',
    language: 'Rust',
    topics: ['python', 'rust', 'package-manager', 'devtools'],
    license: 'MIT',
    totalStars: 92000,
    fork: false,
    archived: false,
    pushedAt: new Date('2026-06-23T07:00:00.000Z'),
    updatedAt: new Date('2026-06-23T07:45:00.000Z'),
  }],
  ['flutter/flutter', {
    fullName: 'flutter/flutter',
    url: 'https://github.com/flutter/flutter',
    description: 'Flutter makes it easy and fast to build beautiful apps for mobile and beyond.',
    language: 'Dart',
    topics: ['flutter', 'dart', 'mobile'],
    license: 'BSD-3-Clause',
    totalStars: 178000,
    fork: false,
    archived: false,
    pushedAt: new Date('2026-06-23T06:00:00.000Z'),
    updatedAt: new Date('2026-06-23T06:45:00.000Z'),
  }],
]);

export class FixtureGitHubRepositoryLiveVerifier implements GitHubRepositoryLiveVerifierPort {
  async verifyRepository(
    request: GitHubRepositoryLiveVerificationRequest,
  ): Promise<GitHubRepositoryLiveRecord | null> {
    return fixtureRepositories.get(request.fullName) ?? null;
  }
}
