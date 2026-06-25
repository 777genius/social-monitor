import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
  "value-objects/reader-summary-scope.ts",
  "value-objects/signal-score.ts",
  "value-objects/summary-evidence-item.ts",
  "value-objects/summary-quality.ts",
  "value-objects/summary-text.ts",
  "value-objects/summary-window.ts",
] as const;

const domainRoot = __dirname;

describe("ReaderSummary domain architecture", () => {
  it("keeps the new ReaderSummary core free from legacy Briefing language", () => {
    const violations: string[] = [];

    for (const file of readerSummaryCoreFiles) {
      const source = sourceFor(file);
      for (const term of ["Briefing", "briefing", "readerBrief"]) {
        if (source.includes(term)) {
          violations.push(`${file} contains legacy term "${term}"`);
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

  it("does not keep legacy Briefing compatibility shims inside the domain", () => {
    const compatibilityShims = [
      "entities/briefing-policy.ts",
      "value-objects/briefing-evidence-item.ts",
      "value-objects/briefing-scope.ts",
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

      return source.includes("buildBriefingReaderBrief")
        ? [`${file} imports legacy buildBriefingReaderBrief`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("does not reintroduce legacy reader brief domain services", () => {
    const legacyServiceFiles = [
      "services/briefing-reader-brief.factory.ts",
      "services/briefing-reader-brief-quality.ts",
      "services/briefing-reader-top-story-selection.ts",
    ];
    const existingFiles = legacyServiceFiles.filter((file) =>
      existsSync(join(domainRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("does not reintroduce legacy Briefing job, artifact or event domain wrappers", () => {
    const legacyDomainWrappers = [
      "entities/briefing-artifact.ts",
      "entities/briefing-job.ts",
      "events/briefing-ready.event.ts",
    ];
    const existingFiles = legacyDomainWrappers.filter((file) =>
      existsSync(join(domainRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("does not reintroduce legacy Briefing repository or contract ports", () => {
    const portsRoot = join(domainRoot, "../ports");
    const legacyRepositoryPorts = [
      "briefing-artifact-repository.port.ts",
      "briefing-job-repository.port.ts",
      "briefing-policy-repository.port.ts",
      "briefing-context-provider.port.ts",
      "briefing-evidence-selector.port.ts",
      "briefing-freshness.port.ts",
      "briefing-job-queue.port.ts",
    ];
    const existingFiles = legacyRepositoryPorts.filter((file) =>
      existsSync(join(portsRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("keeps reader summary model adapters on canonical model contracts", () => {
    const canonicalModelFiles = [
      "../adapters/model/deterministic-reader-summary-model.adapter.ts",
      "../adapters/model/metered-reader-summary-model.adapter.ts",
      "../adapters/model/openai-responses-reader-summary-model.adapter.ts",
      "../adapters/model/openai-responses-reader-summary-model-support.ts",
      "../adapters/model/openai-responses-reader-summary-prompt.ts",
    ];
    const forbiddenFragments = [
      "BriefingModelPort",
      "BriefingModelInput",
      "ProviderBriefingAttempt",
      "GeneratedBriefingDraft",
      "readerBrief",
      "briefing.artifact.v1",
      "social_monitor_briefing_artifact",
      "OpenAiBriefing",
      "openAiBriefing",
      "BriefingInstructions",
      "BriefingPrompt",
    ];
    const violations = canonicalModelFiles.flatMap((file) => {
      const source = sourceFor(file);

      return forbiddenFragments
        .filter((fragment) => source.includes(fragment))
        .map(
          (fragment) => `${file} contains legacy model fragment ${fragment}`,
        );
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary evidence selection on canonical SummaryEvidence language", () => {
    const canonicalFiles = [
      "../ports/reader-summary-evidence-selector.port.ts",
      "../ports/story-ranking-metrics.port.ts",
      "../adapters/evidence/relevance-reader-summary-evidence.selector.ts",
      "../adapters/metrics/story-ranking-metrics.recorder.ts",
    ];
    const violations = canonicalFiles.flatMap((file) => {
      const source = sourceFor(file);

      return source.includes("BriefingEvidence")
        ? [`${file} imports legacy BriefingEvidence language`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps Feed provider metric mapping behind explicit Feed domain imports", () => {
    const selector = sourceFor(
      "../adapters/evidence/relevance-reader-summary-evidence.selector.ts",
    );

    expect(selector).not.toContain('from "@social-monitor/feed"');
    expect(selector).toContain('from "@social-monitor/feed/domain"');
  });

  it("does not keep legacy Briefing evidence selector shims", () => {
    const legacyEvidenceFiles = [
      "../adapters/evidence/relevance-briefing-evidence.selector.ts",
      "../adapters/evidence/relevance-briefing-evidence.selector.spec.ts",
    ];
    const existingFiles = legacyEvidenceFiles.filter((file) =>
      existsSync(join(domainRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("keeps reader summary job execution on canonical application language", () => {
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

      return source.includes("Briefing")
        ? [`${file} imports legacy Briefing language`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary request on canonical application language", () => {
    const canonicalFiles = [
      "../features/request-reader-summary/request-reader-summary.command.ts",
      "../features/request-reader-summary/request-reader-summary.result.ts",
      "../features/request-reader-summary/request-reader-summary.use-case.ts",
      "../ports/reader-summary-job-queue.port.ts",
    ];
    const violations = canonicalFiles.flatMap((file) => {
      const source = sourceFor(file);

      return source.includes("Briefing")
        ? [`${file} imports legacy Briefing language`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary job status on canonical application language", () => {
    const canonicalFiles = [
      "../features/get-reader-summary-job-status/get-reader-summary-job-status.query.ts",
      "../features/get-reader-summary-job-status/get-reader-summary-job-status.result.ts",
      "../features/get-reader-summary-job-status/get-reader-summary-job-status.use-case.ts",
    ];
    const violations = canonicalFiles.flatMap((file) => {
      const source = sourceFor(file);

      return source.includes("Briefing")
        ? [`${file} imports legacy Briefing language`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary read-side on canonical application language", () => {
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

      return source.includes("Briefing")
        ? [`${file} imports legacy Briefing language`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("does not keep legacy Briefing application wrappers", () => {
    const legacyFeatureFiles = [
      "../features/execute-briefing-job/execute-briefing-job.command.ts",
      "../features/execute-briefing-job/execute-briefing-job.result.ts",
      "../features/execute-briefing-job/execute-briefing-job.use-case.ts",
      "../features/get-briefing-job-status/get-briefing-job-status.query.ts",
      "../features/get-briefing-job-status/get-briefing-job-status.result.ts",
      "../features/get-briefing-job-status/get-briefing-job-status.use-case.ts",
      "../features/get-briefing/get-briefing.use-case.ts",
      "../features/get-briefing/get-briefing.query.ts",
      "../features/get-briefing/get-briefing.result.ts",
      "../features/list-briefings/list-briefings.use-case.ts",
      "../features/list-briefings/list-briefings.query.ts",
      "../features/list-briefings/list-briefings.result.ts",
      "../features/request-briefing/request-briefing.command.ts",
      "../features/request-briefing/request-briefing.result.ts",
      "../features/request-briefing/request-briefing.use-case.ts",
      "../features/shared/briefing-artifact-presenter.ts",
    ];
    const existingFiles = legacyFeatureFiles.filter((file) =>
      existsSync(join(domainRoot, file)),
    );

    expect(existingFiles).toEqual([]);
  });

  it("keeps reader summary composition tokens on canonical language", () => {
    const compositionFiles = [
      "../interfaces/rest/summary-provider-tokens.ts",
      "../interfaces/rest/summary-reader-summary.providers.ts",
      "../interfaces/rest/summary-rest.module.ts",
    ];
    const forbiddenTokenFragments = [
      "export const BRIEFING_",
      "provide: BRIEFING_",
      "inject: [BRIEFING_",
      " BRIEFING_JOB_",
      " BRIEFING_ARTIFACT_",
      " BRIEFING_POLICY_",
      " BRIEFING_EVIDENCE_",
      " BRIEFING_CONTEXT_",
    ];
    const violations = compositionFiles.flatMap((file) => {
      const source = sourceFor(file);

      return forbiddenTokenFragments
        .filter((fragment) => source.includes(fragment))
        .map((fragment) => `${file} contains legacy DI token ${fragment}`);
    });

    expect(violations).toEqual([]);
  });

  it("keeps legacy Briefing REST mapping outside canonical application", () => {
    expect(
      existsSync(
        join(domainRoot, "../interfaces/rest/briefing-legacy.mapper.ts"),
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

      return source.includes("briefing-legacy.mapper")
        ? [`${file} imports REST legacy mapper`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary persistence adapters on canonical class and file names", () => {
    const legacyPersistenceAdapters = [
      "../adapters/persistence/in-memory-briefing-artifact.repository.ts",
      "../adapters/persistence/in-memory-briefing-job.repository.ts",
      "../adapters/persistence/in-memory-briefing-policy.repository.ts",
      "../adapters/persistence/prisma/prisma-briefing-artifact.repository.ts",
      "../adapters/persistence/prisma/prisma-briefing-job.repository.ts",
      "../adapters/persistence/prisma/prisma-briefing-policy.repository.ts",
      "../adapters/persistence/prisma/prisma-briefing-artifact-payload.ts",
      "../adapters/persistence/prisma/prisma-briefing-records.ts",
    ];
    const existingLegacyFiles = legacyPersistenceAdapters.filter((file) =>
      existsSync(join(domainRoot, file)),
    );

    expect(existingLegacyFiles).toEqual([]);

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
    const violations = canonicalPersistenceAdapters.flatMap((file) => {
      const source = sourceFor(file);

      return source.includes("InMemoryBriefing") ||
        source.includes("PrismaBriefing")
        ? [`${file} contains legacy persistence adapter class name`]
        : [];
    });

    expect(violations).toEqual([]);
  });

  it("keeps reader summary queue publishing on the canonical command contract", () => {
    expect(
      existsSync(
        join(
          domainRoot,
          "../interfaces/queue/execute-briefing-job-command.handler.ts",
        ),
      ),
    ).toBe(false);

    const handler = sourceFor(
      "../interfaces/queue/execute-reader-summary-job-command.handler.ts",
    );
    const publisher = sourceFor(
      "../adapters/messaging/reader-summary-job-queue.adapter.ts",
    );
    const publisherForbiddenFragments = [
      "briefing.job.execute",
      "briefingJobId",
      'job_type: "briefing"',
      'queue: "briefing"',
    ];
    const violations = [
      ...(handler.includes("ExecuteBriefing")
        ? ["reader summary queue handler contains legacy class language"]
        : []),
      ...publisherForbiddenFragments
        .filter((fragment) => publisher.includes(fragment))
        .map(
          (fragment) => `reader summary queue publisher contains ${fragment}`,
        ),
    ];

    expect(violations).toEqual([]);
  });

  it("keeps legacy briefing event and DTO field names inside explicit compatibility boundaries", () => {
    const summaryRoot = join(domainRoot, "..");
    const allowedCompatibilityFiles = [
      "adapters/anti-corruption/reader-summary-legacy-event-publisher.adapter.ts",
      "interfaces/queue/execute-reader-summary-job-command.handler.ts",
      "interfaces/rest/briefing-job-status.dto.ts",
      "interfaces/rest/briefing-job.controller.ts",
      "interfaces/rest/briefing-legacy.mapper.ts",
      "interfaces/rest/briefing.controller.ts",
      "interfaces/rest/briefing.dto.ts",
      "interfaces/rest/request-briefing.dto.ts",
    ];
    const legacyFragments = ["briefing.ready", "briefingJobId", "briefingId"];
    const violations = collectProductionTsFiles(summaryRoot).flatMap((file) => {
      const source = readFileSync(join(summaryRoot, file), "utf8");
      if (allowedCompatibilityFiles.includes(file)) {
        return [];
      }

      return legacyFragments
        .filter((fragment) => source.includes(fragment))
        .map((fragment) => `${file} contains legacy fragment ${fragment}`);
    });

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

const collectProductionTsFiles = (
  root: string,
  prefix = "",
): readonly string[] => {
  const files: string[] = [];

  for (const entry of readdirSync(join(root, prefix))) {
    const relativePath = prefix.length === 0 ? entry : `${prefix}/${entry}`;
    const absolutePath = join(root, relativePath);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      files.push(...collectProductionTsFiles(root, relativePath));
      continue;
    }

    if (relativePath.endsWith(".ts") && !relativePath.endsWith(".spec.ts")) {
      files.push(relativePath);
    }
  }

  return files;
};
