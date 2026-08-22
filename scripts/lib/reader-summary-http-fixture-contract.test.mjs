import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  parseReaderSummaryFixtureReadyLine,
  probeReaderSummaryFixture,
  readerSummaryFixtureEnvironment,
  readerSummaryFixtureScope,
} from "./reader-summary-http-fixture-contract.mjs";

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const topTitles = [
  "Anthropic publishes official watermark guidance",
  "Cursor agent update reaches HN",
  "GitHub 48 hour exact top",
  "Reddit exact top threshold",
  "SpaceX repository accelerates",
];
const additionalTitles = [
  "GitHub 24 hour exact additional",
  "HN exact additional threshold",
  "Reddit exact additional threshold",
  "X exact additional threshold",
  "GitHub 48 hour exact additional",
];
const fixtureItem = () => ({
  readerSummaryId: "fixture",
  citations: [...topTitles, ...additionalTitles].map((_title, index) => ({
    citationId: `citation-${index}`,
    feedItemId: `feed-item-${index}`,
  })),
  readerBrief: {
    topReads: topTitles.map((title, index) => ({
      title,
      canonicalUrl: `https://top.example.test/${index}`,
      citationIds: [`citation-${index}`],
    })),
    selectedPosts: additionalTitles.map((title, index) => ({
      title,
      canonicalUrl: `https://additional.example.test/${index}`,
      citationIds: [`citation-${topTitles.length + index}`],
    })),
  },
});

test("ready protocol accepts only a credential-free loopback HTTP origin", () => {
  assert.equal(
    parseReaderSummaryFixtureReadyLine(
      '{"status":"ready","baseUrl":"http://127.0.0.1:4567"}',
    ),
    "http://127.0.0.1:4567",
  );
  assert.equal(
    parseReaderSummaryFixtureReadyLine("compiling fixture"),
    undefined,
  );
  assert.throws(
    () =>
      parseReaderSummaryFixtureReadyLine(
        '{"status":"ready","baseUrl":"https://api.example.test"}',
      ),
    /loopback HTTP/u,
  );
  assert.throws(
    () =>
      parseReaderSummaryFixtureReadyLine(
        '{"status":"ready","baseUrl":"http://user:secret@127.0.0.1:4567"}',
      ),
    /credential-free/u,
  );
});

test("fixture environment replaces inherited production-facing runtime settings", () => {
  const parent = {
    DATABASE_URL: "postgresql://production.invalid/live",
    SOCIAL_MONITOR_RUNTIME_PROFILE: "beta",
    SUMMARY_JOB_QUEUE_MODE: "rabbitmq",
    SOCIAL_MONITOR_METRICS_MODE: "otlp",
    OTEL_EXPORTER_OTLP_ENDPOINT: "https://telemetry.invalid",
    OTEL_EXPORTER_OTLP_HEADERS: "authorization=fixture-sensitive-value",
    SUMMARY_MEMORY_MODE: "memo-stack",
    INFINITY_CONTEXT_URL: "https://memory.invalid",
    INFINITY_CONTEXT_TOKEN: "fixture-sensitive-value",
    OPENAI_API_KEY: "fixture-sensitive-value",
    SUMMARY_MODEL_PROVIDER: "openai-responses",
    SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER: "google-gemini",
    GOOGLE_GEMINI_API_KEY: "fixture-sensitive-value",
    HOME: "/production-home",
    NODE_OPTIONS: "--require=/production/instrumentation.cjs",
    PATH: "/fixture/bin",
    PRESERVED: "yes",
  };
  const child = readerSummaryFixtureEnvironment(parent);
  assert.deepEqual(Object.keys(child).sort(), [
    "DATABASE_URL",
    "PATH",
    "POSTGRES_RUNTIME_PROCESS",
    "READER_SUMMARY_HTTP_E2E_FIXTURE",
    "READER_SUMMARY_MODEL_PROVIDER",
    "READER_SUMMARY_PROMOTION_V1_ENABLED",
    "READER_SUMMARY_TOPIC_LABELER",
    "SOCIAL_MONITOR_METRICS_MODE",
    "SOCIAL_MONITOR_RUNTIME_PROFILE",
    "SUMMARY_JOB_QUEUE_MODE",
    "SUMMARY_MEMORY_MODE",
    "SUMMARY_MODEL_PROVIDER",
    "SUMMARY_PERSISTENCE",
    "SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER",
  ]);
  assert.notEqual(child, parent);
  assert.equal(child.PRESERVED, undefined);
  assert.equal(child.PATH, "/fixture/bin");
  assert.equal(child.SOCIAL_MONITOR_RUNTIME_PROFILE, "local-dev");
  assert.equal(child.SUMMARY_JOB_QUEUE_MODE, "in-memory");
  assert.equal(child.SOCIAL_MONITOR_METRICS_MODE, "in-memory");
  assert.equal(child.SUMMARY_MEMORY_MODE, "disabled");
  assert.equal(child.SUMMARY_MODEL_PROVIDER, "deterministic");
  assert.equal(child.READER_SUMMARY_MODEL_PROVIDER, "deterministic");
  assert.equal(child.READER_SUMMARY_TOPIC_LABELER, "deterministic");
  assert.equal(child.SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER, "disabled");
  for (const forbidden of [
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
    "INFINITY_CONTEXT_URL",
    "INFINITY_CONTEXT_TOKEN",
    "OPENAI_API_KEY",
    "GOOGLE_GEMINI_API_KEY",
    "HOME",
    "NODE_OPTIONS",
  ]) {
    assert.equal(
      child[forbidden],
      undefined,
      `${forbidden} must not be inherited`,
    );
  }
  assert.match(child.DATABASE_URL, /127\.0\.0\.1/u);
  assert.doesNotMatch(child.DATABASE_URL, /production/u);
  assert.equal(child.READER_SUMMARY_HTTP_E2E_FIXTURE, "1");
  assert.equal(parent.SOCIAL_MONITOR_RUNTIME_PROFILE, "beta");
});

test("HTTP probe uses the current reader summaries route and fixture scope", async () => {
  let observed;
  const server = createServer((request, response) => {
    observed = {
      method: request.method,
      url: request.url,
      tenantId: request.headers["x-tenant-id"],
      workspaceId: request.headers["x-workspace-id"],
      workspaceRole: request.headers["x-workspace-role"],
    };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ items: [fixtureItem()] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const item = await probeReaderSummaryFixture({
      baseUrl: `http://127.0.0.1:${address.port}`,
    });
    assert.deepEqual(item, fixtureItem());
    assert.deepEqual(observed, {
      method: "GET",
      url: "/reader-summaries",
      tenantId: readerSummaryFixtureScope.tenantId,
      workspaceId: readerSummaryFixtureScope.workspaceId,
      workspaceRole: "viewer",
    });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      }),
    );
  }
});

test("HTTP probe rejects malformed and non-success fixture responses", async () => {
  await assert.rejects(
    probeReaderSummaryFixture({
      baseUrl: "http://127.0.0.1:1234",
      request: async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ items: [] }),
      }),
    }),
    /exactly one persisted item/u,
  );
  await assert.rejects(
    probeReaderSummaryFixture({
      baseUrl: "http://127.0.0.1:1234",
      request: async () => ({
        ok: false,
        status: 503,
        text: async () => "fixture unavailable",
      }),
    }),
    /GET \/reader-summaries failed with 503/u,
  );
});

test("HTTP probe rejects count order dedup rejection and URL regressions", async () => {
  const cases = [
    {
      mutate: (item) => item.readerBrief.topReads.pop(),
      pattern: /exactly 5 top stories/u,
    },
    {
      mutate: (item) => item.readerBrief.selectedPosts.reverse(),
      pattern: /additional stories titles/u,
    },
    {
      mutate: (item) => {
        item.readerBrief.selectedPosts[0].canonicalUrl =
          item.readerBrief.topReads[0].canonicalUrl;
      },
      pattern: /identities must be present and deduplicated/u,
    },
    {
      mutate: (item) => {
        item.readerBrief.selectedPosts[0].title =
          "Duplicate Additional must lose to Top";
      },
      pattern: /additional stories titles|exposed rejected title/u,
    },
    {
      mutate: (item) => {
        item.citations[topTitles.length].feedItemId =
          item.citations[0].feedItemId;
      },
      pattern: /feed identities must be present and deduplicated/u,
    },
    {
      mutate: (item) => {
        item.context = {
          url: "https://reddit.com/r/fixture/comments/zero-nineteen/story",
        };
      },
      pattern: /exposed forbidden URL/u,
    },
  ];
  for (const { mutate, pattern } of cases) {
    const item = fixtureItem();
    mutate(item);
    await assert.rejects(
      probeReaderSummaryFixture({
        baseUrl: "http://127.0.0.1:1234",
        request: async () => ({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ items: [item] }),
        }),
      }),
      pattern,
    );
  }
});

test("runner completes codegen before fixture startup and drives the Chrome test", async () => {
  const runner = await readFile(
    resolve(repositoryRoot, "scripts/run-reader-summary-http-chrome-e2e.mjs"),
    "utf8",
  );
  const preflight = runner.indexOf("await ensureReaderSummaryPrismaClient(");
  const fixtureSpawn = runner.indexOf("const fixture = supervisor.spawn(");
  assert.notEqual(preflight, -1);
  assert.notEqual(fixtureSpawn, -1);
  assert.ok(preflight < fixtureSpawn);
  assert.doesNotMatch(runner, /--no-pub/u);
  assert.match(runner, /"drive"/u);
  assert.match(runner, /--driver=test_driver\/integration_test\.dart/u);
  assert.match(
    runner,
    /--target=integration_test\/reader_summary_http_drive_test\.dart/u,
  );
  assert.match(runner, /"-d",\s*"web-server"/u);
  assert.match(runner, /--driver-port=/u);
  assert.match(runner, /--chrome-binary=/u);
  assert.match(runner, /--dart-define=READER_SUMMARY_HTTP_FIXTURE_BASE_URL=/u);
  assert.doesNotMatch(runner, /--platform=chrome/u);
  assert.doesNotMatch(runner, /--wasm/u);
  assert.match(runner, /probeReaderSummaryFixture\(\{ baseUrl \}\)/u);
  assert.match(runner, /totalTimeoutMs: config\.totalTimeoutMs/u);
  assert.match(runner, /fixtureStartupInactivityTimeoutMs = 300_000/u);
  assert.match(runner, /fixtureStartupHardCapMs = 600_000/u);
  assert.match(
    runner,
    /hardStartupTimeoutMs: Math\.min\([\s\S]*?fixtureStartupHardCapMs,[\s\S]*?remainingTimeoutMs\(\)/u,
  );
  assert.match(
    runner,
    /verifyReaderSummaryFlutter\(\{[\s\S]*?environment: flutterEnvironment,[\s\S]*?workingDirectory: frontendDirectory,[\s\S]*?\}\);/u,
  );
  assert.match(
    runner,
    /verifyReaderSummaryChromeDriver\(\{[\s\S]*?environment: browserRun\.environment,[\s\S]*?\}\);/u,
  );
});

test("fixture server emits every allowlisted startup boundary in order", async () => {
  const [reporter, server] = await Promise.all([
    readFile(
      resolve(
        repositoryRoot,
        "scripts/lib/reader-summary-fixture-stage-reporter.ts",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        repositoryRoot,
        "scripts/reader-summary-http-chrome-fixture-server.ts",
      ),
      "utf8",
    ),
  ]);
  const stages = [
    "module_runtime_entry",
    "pglite_construction_start",
    "pglite_construction_end",
    "pglite_socket_start",
    "pglite_socket_started",
    "prisma_db_push_start",
    "prisma_db_push_end",
    "nest_module_compile_start",
    "nest_module_compile_end",
    "nest_app_create",
    "seeding_start",
    "seeding_end",
    "http_listen_start",
    "http_listening",
    "ready",
  ];
  const runtime = `${reporter}\n${server}`;
  let cursor = -1;
  for (const stage of stages) {
    const next = runtime.indexOf(
      `emitReaderSummaryFixtureStage("${stage}")`,
      cursor + 1,
    );
    assert.notEqual(next, -1, `missing fixture stage ${stage}`);
    assert.ok(next > cursor, `fixture stage ${stage} must be ordered`);
    cursor = next;
  }
  assert.match(reporter, /status: "stage",[\s\S]*?stage,[\s\S]*?elapsedMs:/u);
  assert.doesNotMatch(
    reporter.slice(
      reporter.indexOf("const emitReaderSummaryFixtureStage"),
      reporter.indexOf(
        'emitReaderSummaryFixtureStage("module_runtime_entry")',
      ),
    ),
    /DATABASE_URL|databaseUrl|port|payload|error/u,
  );
  assert.match(
    server,
    /^import \{ emitReaderSummaryFixtureStage \} from[\s\S]*?reader-summary-fixture-stage-reporter/u,
  );
  assert.match(server, /status: "ready",\s*baseUrl:/u);
  assert.match(
    server,
    /createReaderSummaryFixtureLifecycle\(\{[\s\S]*?application: \(\) => fixtureApp,[\s\S]*?testingModule: \(\) => fixtureModule,[\s\S]*?databaseServer: \(\) => fixtureDatabaseServer,[\s\S]*?database: \(\) => fixtureDatabase,[\s\S]*?resourceCloseTimeoutMs: 5_000,[\s\S]*?report: \(message\) => \{ process\.stderr\.write\(message\); \},[\s\S]*?exit: \(code\) => \{ process\.exit\(code\); \},[\s\S]*?\}\)/u,
  );
  assert.match(
    server,
    /start\(\)\.catch\(\(\) => fixtureLifecycle\.handleStartupFailure\(\)\)/u,
  );
});

test("fixture launch is transpile-only while the strict build remains a gate", async () => {
  const [runner, packageManifest] = await Promise.all([
    readFile(
      resolve(repositoryRoot, "scripts/run-reader-summary-http-chrome-e2e.mjs"),
      "utf8",
    ),
    readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  ]);
  assert.match(
    runner,
    /node_modules\/ts-node\/dist\/bin\.js"\),\s*"--transpile-only",\s*"--compiler-options",\s*'\{"rootDir":"\."\}',\s*"-r",\s*"tsconfig-paths\/register"/u,
  );
  const manifest = JSON.parse(packageManifest);
  assert.match(manifest.scripts.build, /^tsc -p /u);
  assert.equal(manifest.devDependencies["@electric-sql/pglite"], "0.4.3");
  assert.equal(
    manifest.devDependencies["@electric-sql/pglite-socket"],
    "0.1.3",
  );
});

test("outer timeout reserves cleanup time beyond the runner deadline", async () => {
  const [runner, packageManifest] = await Promise.all([
    readFile(
      resolve(repositoryRoot, "scripts/run-reader-summary-http-chrome-e2e.mjs"),
      "utf8",
    ),
    readFile(resolve(repositoryRoot, "package.json"), "utf8"),
  ]);
  const script =
    JSON.parse(packageManifest).scripts["check:reader-summary-http-chrome-e2e"];
  const frontendScript = JSON.parse(packageManifest).scripts["check:frontend"];
  const outer = Number(script.match(/--timeout-ms (\d+)/u)?.[1]);
  assert.match(runner, /totalTimeoutMs: config\.totalTimeoutMs/u);
  assert.equal(outer, 2_420_000);
  assert.equal(outer - 2_400_000, 20_000);
  assert.match(frontendScript, /flutter test app\/test/u);
  assert.doesNotMatch(frontendScript, /flutter test app(?:\s|$)/u);
});

test("Flutter Drive scenario mounts the public production summary route", async () => {
  const [scenario, wiring, driver] = await Promise.all([
    readFile(
      resolve(
        repositoryRoot,
        "apps/frontend/app/integration_test/reader_summary_http_drive_test.dart",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        repositoryRoot,
        "apps/frontend/app/integration_test/support/reader_summary_production_wiring.dart",
      ),
      "utf8",
    ),
    readFile(
      resolve(
        repositoryRoot,
        "apps/frontend/app/test_driver/integration_test.dart",
      ),
      "utf8",
    ),
  ]);
  const driveSurface = `${scenario}\n${wiring}`;
  for (const productionBoundary of [
    "PublishedSummariesFeatureRoute.generatedApi",
    "GeneratedApiRuntime",
    "WorkspaceScope",
    "published-reader-summary-view",
    "published-summary-scroll-view",
    "reader-summary-top-posts-board-additional-stories",
  ]) {
    assert.match(driveSurface, new RegExp(productionBoundary, "u"));
  }
  assert.doesNotMatch(driveSurface, /runtime\.rest\.readerSummaries/u);
  assert.doesNotMatch(driveSurface, /ReaderSummaryView\.readOnly/u);
  assert.doesNotMatch(driveSurface, /src\/infrastructure/u);
  assert.match(
    scenario,
    /IntegrationTestWidgetsFlutterBinding\.ensureInitialized\(\);/u,
  );
  assert.doesNotMatch(scenario, /\btester\s*\.\s*ensureSemantics\s*\(/u);
  assert.doesNotMatch(scenario, /\bsemanticsEnabled\s*:\s*false\b/u);
  assert.match(scenario, /fixtureBaseUrl,[\s\S]*?isNotEmpty/u);
  assert.doesNotMatch(scenario, /skip:/u);
  assert.match(driver, /integrationDriver\(/u);
});
