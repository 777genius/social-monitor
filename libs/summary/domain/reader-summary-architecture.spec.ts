import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const readerSummaryCoreFiles = [
  "aggregates/reader-summary.ts",
  "entities/citation.ts",
  "entities/reader-action.ts",
  "entities/reader-summary-artifact.ts",
  "entities/reader-summary-artifact-validation.ts",
  "entities/reader-summary-job.ts",
  "entities/reader-summary-policy.ts",
  "entities/reader-summary-snapshot.ts",
  "entities/source-mix-entry.ts",
  "entities/top-read.ts",
  "events/reader-action-recorded.event.ts",
  "events/reader-summary-generated.event.ts",
  "events/reader-summary-ready.event.ts",
  "policies/reader-action-policy.ts",
  "policies/source-mix-quality-policy.ts",
  "policies/top-read-selection-policy.ts",
  "services/reader-summary-support.ts",
  "services/story-clustering.service.ts",
  "services/story-key-normalizer.ts",
  "services/story-ranking-telemetry.ts",
  "value-objects/provider-metric-label.ts",
  "value-objects/reader-summary-provider-identity.ts",
  "value-objects/reader-summary-scope.ts",
  "value-objects/signal-score.ts",
  "value-objects/summary-evidence-item.ts",
  "value-objects/summary-quality.ts",
  "value-objects/summary-text.ts",
  "value-objects/summary-window.ts",
] as const;

const domainRoot = __dirname;

describe("ReaderSummary domain architecture", () => {
  it("keeps REST reader brief naming out of the ReaderSummary domain core", () => {
    const violations: string[] = [];

    for (const file of readerSummaryCoreFiles) {
      const source = sourceFor(file);
      for (const term of ["readerBrief"]) {
        if (source.includes(term)) {
          violations.push(`${file} contains transport-facing term "${term}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps ReaderSummary domain independent from outer bounded contexts and infrastructure", () => {
    const violations: string[] = [];
    const forbiddenImportFragments = [
      "@social-monitor/feed",
      "@social-monitor/ingestion",
      "@social-monitor/relevance",
      "/adapters/",
      "/features/",
      "/interfaces/",
      "/ports/",
    ];

    for (const file of readerSummaryCoreFiles) {
      const source = sourceFor(file);
      for (const importedPath of importPaths(source)) {
        if (
          forbiddenImportFragments.some((fragment) =>
            importedPath.includes(fragment),
          )
        ) {
          violations.push(`${file} imports ${importedPath}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not own provider-native metric formatting in the Summary domain", () => {
    const forbiddenMetricFragments = [
      "services/provider-metrics-formatting.ts",
      "github_repository",
      "github_trending_repository",
      "reddit_post",
      "hacker_news_story",
      "x_post",
      ".stars",
      ".points",
      ".likes",
    ];
    const violations: string[] = [];

    for (const file of readerSummaryCoreFiles) {
      const source = sourceFor(file);
      for (const fragment of forbiddenMetricFragments) {
        if (source.includes(fragment)) {
          violations.push(
            `${file} contains provider metric fragment ${fragment}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not own provider display labels in the Summary domain", () => {
    const forbiddenDisplayFragments = [
      "providerLabel",
      "Repo Radar",
      "GitHub Trending",
      "GitHub",
      "Hacker News",
      "Reddit",
    ];
    const violations: string[] = [];

    for (const file of readerSummaryCoreFiles) {
      const source = sourceFor(file);
      for (const fragment of forbiddenDisplayFragments) {
        if (source.includes(fragment)) {
          violations.push(
            `${file} contains provider display fragment ${fragment}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not keep canonical ReaderSummary compatibility shims inside the domain", () => {
    const compatibilityShims = [
      "entities/readerSummary-policy.ts",
      "value-objects/readerSummary-evidence-item.ts",
      "value-objects/readerSummary-scope.ts",
    ];
    const existingFiles = compatibilityShims.filter((file) =>
      existsSync(join(domainRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("keeps production reader summary builders on canonical ReaderSummary language", () => {
    const productionFiles = [
      "../adapters/model/deterministic-reader-summary-model.adapter.ts",
      "../adapters/model/openai-responses-reader-summary-model.adapter.ts",
      "../adapters/model/openai-responses-reader-summary-model-support.ts",
      "../features/shared/reader-summary-artifact-presenter.ts",
    ];
    const violations = productionFiles.flatMap((file) => {
      const source = sourceFor(file);

      return source.includes("buildReaderSummaryReaderBrief")
        ? [`${file} imports previous buildReaderSummaryReaderBrief`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("does not reintroduce previous reader brief domain services", () => {
    const previousServiceFiles = [
      "services/readerSummary-reader-brief.factory.ts",
      "services/readerSummary-reader-brief-quality.ts",
      "services/readerSummary-reader-top-story-selection.ts",
    ];
    const existingFiles = previousServiceFiles.filter((file) =>
      existsSync(join(domainRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("does not reintroduce canonical ReaderSummary job, artifact or event domain wrappers", () => {
    const previousDomainWrappers = [
      "entities/readerSummary-artifact.ts",
      "entities/readerSummary-job.ts",
      "events/readerSummary-ready.event.ts",
    ];
    const existingFiles = previousDomainWrappers.filter((file) =>
      existsSync(join(domainRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("does not reintroduce canonical ReaderSummary repository or contract ports", () => {
    const portsRoot = join(domainRoot, "../ports");
    const previousRepositoryPorts = [
      "readerSummary-artifact-repository.port.ts",
      "readerSummary-job-repository.port.ts",
      "readerSummary-policy-repository.port.ts",
      "readerSummary-context-provider.port.ts",
      "readerSummary-evidence-selector.port.ts",
      "readerSummary-freshness.port.ts",
      "readerSummary-job-queue.port.ts",
    ];
    const existingFiles = previousRepositoryPorts.filter((file) =>
      existsSync(join(portsRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("keeps reader summary model adapters off previous reader brief contracts", () => {
    const canonicalModelFiles = [
      "../adapters/model/deterministic-reader-summary-model.adapter.ts",
      "../adapters/model/metered-reader-summary-model.adapter.ts",
      "../adapters/model/openai-responses-reader-summary-model.adapter.ts",
      "../adapters/model/openai-responses-reader-summary-model-support.ts",
      "../adapters/model/openai-responses-reader-summary-prompt.ts",
    ];
    const forbiddenFragments = [
      "readerBrief",
      "buildReaderSummaryReaderBrief",
    ];
    const violations = canonicalModelFiles.flatMap((file) => {
      const source = sourceFor(file);

      return forbiddenFragments
        .filter((fragment) => source.includes(fragment))
        .map(
          (fragment) => `${file} contains deprecated model fragment ${fragment}`,
        );
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary evidence selection on domain evidence items", () => {
    const canonicalFiles = [
      "../ports/reader-summary-evidence-selector.port.ts",
      "../ports/story-ranking-metrics.port.ts",
      "../adapters/evidence/relevance-reader-summary-evidence.selector.ts",
      "../adapters/metrics/story-ranking-metrics.recorder.ts",
    ];
    const violations = canonicalFiles.flatMap((file) => {
      const source = sourceFor(file);

      return source.includes("ReaderSummaryEvidenceItem")
        ? [`${file} imports previous ReaderSummaryEvidenceItem language`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps Feed provider metric mapping behind explicit Feed domain imports", () => {
    const evidenceAdapterFiles = [
      "../adapters/evidence/relevance-reader-summary-evidence.selector.ts",
      "../adapters/evidence/relevance-reader-summary-evidence-support.ts",
    ];
    const sources = evidenceAdapterFiles.map(sourceFor);
    const providerMetricMapping = sources[1] ?? "";

    expect(sources).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining('from "@social-monitor/feed"'),
      ]),
    );
    expect(providerMetricMapping).toContain(
      'from "@social-monitor/feed/domain"',
    );
  });

  it("does not keep canonical ReaderSummary evidence selector shims", () => {
    const previousEvidenceFiles = [
      "../adapters/evidence/relevance-readerSummary-evidence.selector.ts",
      "../adapters/evidence/relevance-readerSummary-evidence.selector.spec.ts",
    ];
    const existingFiles = previousEvidenceFiles.filter((file) =>
      existsSync(join(domainRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("keeps reader summary job execution independent from REST and adapters", () => {
    const canonicalFiles = [
      "../features/execute-reader-summary-job/execute-reader-summary-job.command.ts",
      "../features/execute-reader-summary-job/execute-reader-summary-job.result.ts",
      "../features/execute-reader-summary-job/execute-reader-summary-job.use-case.ts",
      "../ports/reader-summary-artifact-repository.port.ts",
      "../ports/reader-summary-context-provider.port.ts",
      "../ports/reader-summary-job-repository.port.ts",
      "../ports/reader-summary-model.port.ts",
      "../ports/reader-summary-policy-repository.port.ts",
    ];
    const violations = canonicalFiles.flatMap((file) => {
      const source = sourceFor(file);

      return importPaths(source)
        .filter(
          (importedPath) =>
            importedPath.includes("/interfaces/") ||
            importedPath.includes("/adapters/") ||
            importedPath.includes("reader-summary-rest.mapper"),
        )
        .map((importedPath) => `${file} imports ${importedPath}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary request independent from REST and adapters", () => {
    const canonicalFiles = [
      "../features/request-reader-summary/request-reader-summary.command.ts",
      "../features/request-reader-summary/request-reader-summary.result.ts",
      "../features/request-reader-summary/request-reader-summary.use-case.ts",
      "../ports/reader-summary-job-queue.port.ts",
    ];
    const violations = canonicalFiles.flatMap((file) => {
      const source = sourceFor(file);

      return importPaths(source)
        .filter(
          (importedPath) =>
            importedPath.includes("/interfaces/") ||
            importedPath.includes("/adapters/") ||
            importedPath.includes("reader-summary-rest.mapper"),
        )
        .map((importedPath) => `${file} imports ${importedPath}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary job status independent from REST and adapters", () => {
    const canonicalFiles = [
      "../features/get-reader-summary-job-status/get-reader-summary-job-status.query.ts",
      "../features/get-reader-summary-job-status/get-reader-summary-job-status.result.ts",
      "../features/get-reader-summary-job-status/get-reader-summary-job-status.use-case.ts",
    ];
    const violations = canonicalFiles.flatMap((file) => {
      const source = sourceFor(file);

      return importPaths(source)
        .filter(
          (importedPath) =>
            importedPath.includes("/interfaces/") ||
            importedPath.includes("/adapters/") ||
            importedPath.includes("reader-summary-rest.mapper"),
        )
        .map((importedPath) => `${file} imports ${importedPath}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary read-side independent from REST and adapters", () => {
    const canonicalFiles = [
      "../features/get-reader-summary/get-reader-summary.query.ts",
      "../features/get-reader-summary/get-reader-summary.result.ts",
      "../features/get-reader-summary/get-reader-summary.use-case.ts",
      "../features/list-reader-summaries/list-reader-summaries.query.ts",
      "../features/list-reader-summaries/list-reader-summaries.result.ts",
      "../features/list-reader-summaries/list-reader-summaries.use-case.ts",
      "../features/shared/reader-summary-artifact-presenter.ts",
      "../ports/reader-summary-freshness.port.ts",
    ];
    const violations = canonicalFiles.flatMap((file) => {
      const source = sourceFor(file);

      return importPaths(source)
        .filter(
          (importedPath) =>
            importedPath.includes("/interfaces/") ||
            importedPath.includes("/adapters/") ||
            importedPath.includes("reader-summary-rest.mapper"),
        )
        .map((importedPath) => `${file} imports ${importedPath}`);
    });

    expect(violations).toEqual([]);
  });

  it("does not keep canonical ReaderSummary application wrappers", () => {
    const previousFeatureFiles = [
      "../features/execute-readerSummary-job/execute-readerSummary-job.command.ts",
      "../features/execute-readerSummary-job/execute-readerSummary-job.result.ts",
      "../features/execute-readerSummary-job/execute-readerSummary-job.use-case.ts",
      "../features/get-readerSummary-job-status/get-readerSummary-job-status.query.ts",
      "../features/get-readerSummary-job-status/get-readerSummary-job-status.result.ts",
      "../features/get-readerSummary-job-status/get-readerSummary-job-status.use-case.ts",
      "../features/get-readerSummary/get-readerSummary.use-case.ts",
      "../features/get-readerSummary/get-readerSummary.query.ts",
      "../features/get-readerSummary/get-readerSummary.result.ts",
      "../features/request-readerSummary/request-readerSummary.command.ts",
      "../features/request-readerSummary/request-readerSummary.result.ts",
      "../features/request-readerSummary/request-readerSummary.use-case.ts",
      "../features/shared/readerSummary-artifact-presenter.ts",
    ];
    const existingFiles = previousFeatureFiles.filter((file) =>
      existsSync(join(domainRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("keeps reader summary composition in the REST composition root", () => {
    const compositionFiles = [
      "../interfaces/rest/summary-provider-tokens.ts",
      "../interfaces/rest/summary-reader-summary.providers.ts",
      "../interfaces/rest/summary-rest.module.ts",
    ];
    const violations = compositionFiles.flatMap((file) => {
      const source = sourceFor(file);

      return importPaths(source)
        .filter((importedPath) => importedPath.includes("../../domain/"))
        .map((importedPath) => `${file} imports domain through ${importedPath}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps canonical ReaderSummary REST mapping outside canonical application", () => {
    expect(
      existsSync(
        join(domainRoot, "../interfaces/rest/reader-summary-rest.mapper.ts"),
      ),
    ).toBe(true);

    const canonicalFiles = [
      "../features/request-reader-summary/request-reader-summary.use-case.ts",
      "../features/execute-reader-summary-job/execute-reader-summary-job.use-case.ts",
      "../features/get-reader-summary/get-reader-summary.use-case.ts",
      "../features/list-reader-summaries/list-reader-summaries.use-case.ts",
      "../features/get-reader-summary-job-status/get-reader-summary-job-status.use-case.ts",
      "../features/shared/reader-summary-artifact-presenter.ts",
    ];
    const violations = canonicalFiles.flatMap((file) => {
      const source = sourceFor(file);

      return source.includes("reader-summary-rest.mapper")
        ? [`${file} imports REST previous mapper`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary persistence adapters on canonical class and file names", () => {
    const canonicalPersistenceAdapters = [
      "../adapters/persistence/in-memory-reader-summary-artifact.repository.ts",
      "../adapters/persistence/in-memory-reader-summary-job.repository.ts",
      "../adapters/persistence/in-memory-reader-summary-policy.repository.ts",
      "../adapters/persistence/prisma/prisma-reader-summary-artifact.repository.ts",
      "../adapters/persistence/prisma/prisma-reader-summary-job.repository.ts",
      "../adapters/persistence/prisma/prisma-reader-summary-policy.repository.ts",
      "../adapters/persistence/prisma/prisma-reader-summary-artifact-payload.ts",
      "../adapters/persistence/prisma/prisma-reader-summary-records.ts",
    ];
    const missingFiles = canonicalPersistenceAdapters.filter(
      (file) => !existsSync(join(domainRoot, file)),
    );

    expect(missingFiles).toEqual([]);
  });

  it("keeps reader summary queue publishing on the canonical command contract", () => {
    expect(
      existsSync(
        join(
          domainRoot,
          "../interfaces/queue/execute-readerSummary-job-command.handler.ts",
        ),
      ),
    ).toBe(false);

    const handler = sourceFor(
      "../interfaces/queue/execute-reader-summary-job-command.handler.ts",
    );
    const publisher = sourceFor(
      "../adapters/messaging/reader-summary-job-queue.adapter.ts",
    );
    const queuePort = sourceFor("../ports/reader-summary-job-queue.port.ts");
    const requiredFragments: ReadonlyArray<readonly [string, string]> = [
      [handler, "ExecuteReaderSummaryJobCommandHandler"],
      [handler, "readerSummaryJobId"],
      [handler, "EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE"],
      [publisher, "EXECUTE_READER_SUMMARY_JOB_COMMAND_TYPE"],
      [queuePort, "reader_summary.job.execute"],
      [publisher, "readerSummaryJobId"],
    ];
    const violations = requiredFragments.flatMap(([source, fragment]) =>
      source.includes(fragment)
        ? []
        : [`reader summary queue contract is missing ${fragment}`],
    );

    expect(violations).toEqual([]);
  });

  it("keeps reader summary events and DTO fields canonical", () => {
    const requiredFragments: ReadonlyArray<readonly [string, string]> = [
      [
        sourceFor("../features/execute-reader-summary-job/publish-reader-summary-job.ts"),
        "reader_summary.ready",
      ],
      [
        sourceFor("../interfaces/rest/reader-summary-job-status.dto.ts"),
        "readerSummaryJobId",
      ],
      [
        sourceFor("../interfaces/rest/reader-summary-response.dto.ts"),
        "readerSummaryId",
      ],
      [
        sourceFor("../interfaces/rest/request-reader-summary.dto.ts"),
        "readerSummaryJobId",
      ],
    ];
    const violations = requiredFragments.flatMap(([source, fragment]) =>
      source.includes(fragment)
        ? []
        : [`reader summary REST/event contract is missing ${fragment}`],
    );

    expect(violations).toEqual([]);
  });
});

const sourceFor = (relativePath: string): string => {
  const path = join(domainRoot, relativePath);
  if (!existsSync(path)) {
    throw new Error(
      `ReaderSummary architecture file is missing: ${relativePath}`,
    );
  }

  return readFileSync(path, "utf8");
};

const importPaths = (source: string): readonly string[] =>
  [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1] ?? "");
