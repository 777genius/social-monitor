const fixtureTenantId = "00000000-0000-7000-8000-000000000701";
const fixtureWorkspaceId = "00000000-0000-7000-8000-000000000702";
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
const expectedTopTitles = [
  "Anthropic publishes official watermark guidance",
  "Cursor agent update reaches HN",
  "GitHub 48 hour exact top",
  "Reddit exact top threshold",
  "SpaceX repository accelerates",
];
const expectedAdditionalTitles = [
  "GitHub 24 hour exact additional",
  "HN exact additional threshold",
  "Reddit exact additional threshold",
  "X exact additional threshold",
  "GitHub 48 hour exact additional",
];
const rejectedTitles = [
  "Cursor official same-story note",
  "Duplicate Additional must lose to Top",
  "Eligible related topic must stay absent",
  "Reddit 7 score 5 comments absent",
  "Reddit 0 score 19 comments absent",
  "Negative controversy must stay absent",
  "X reply-only evidence absent",
  "Missing metrics absent",
  "Conflicting metrics absent",
  "X threshold minus one absent",
  "Reddit threshold minus one absent",
  "HN threshold minus one absent",
  "GitHub threshold minus one absent",
];
const forbiddenUrl =
  "https://reddit.com/r/fixture/comments/zero-nineteen/story";

export const parseReaderSummaryFixtureReadyLine = (line) => {
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (record?.status !== "ready" || typeof record.baseUrl !== "string") {
    return undefined;
  }
  const url = new URL(record.baseUrl);
  if (
    url.protocol !== "http:" ||
    !loopbackHosts.has(url.hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "Reader summary fixture must advertise a credential-free loopback HTTP base URL",
    );
  }
  return url.origin;
};

const inheritedEnvironmentAllowlist = [
  "LANG",
  "LC_ALL",
  "PATH",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
];

export const readerSummaryFixtureEnvironment = (environment = process.env) => ({
  ...Object.fromEntries(
    inheritedEnvironmentAllowlist
      .filter((name) => typeof environment[name] === "string")
      .map((name) => [name, environment[name]]),
  ),
  DATABASE_URL:
    "postgresql://reader_summary_fixture@127.0.0.1:5432/reader_summary_fixture",
  POSTGRES_RUNTIME_PROCESS: "api-gateway",
  SOCIAL_MONITOR_RUNTIME_PROFILE: "local-dev",
  SUMMARY_PERSISTENCE: "prisma",
  SUMMARY_JOB_QUEUE_MODE: "in-memory",
  SOCIAL_MONITOR_METRICS_MODE: "in-memory",
  SUMMARY_MEMORY_MODE: "disabled",
  SUMMARY_MODEL_PROVIDER: "deterministic",
  READER_SUMMARY_MODEL_PROVIDER: "deterministic",
  READER_SUMMARY_TOPIC_LABELER: "deterministic",
  SUMMARY_YOUTUBE_VIDEO_SUMMARY_PROVIDER: "disabled",
  READER_SUMMARY_PROMOTION_V1_ENABLED: "true",
  READER_SUMMARY_HTTP_E2E_FIXTURE: "1",
});

export const probeReaderSummaryFixture = async ({
  baseUrl,
  request = fetch,
}) => {
  const origin = parseReaderSummaryFixtureReadyLine(
    JSON.stringify({ status: "ready", baseUrl }),
  );
  const response = await request(`${origin}/reader-summaries`, {
    headers: {
      "x-tenant-id": fixtureTenantId,
      "x-workspace-id": fixtureWorkspaceId,
      "x-workspace-role": "viewer",
    },
    signal: globalThis.AbortSignal.timeout(15_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Reader summary fixture GET /reader-summaries failed with ${response.status}: ${body}`,
    );
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(
      `Reader summary fixture GET /reader-summaries returned invalid JSON: ${body}`,
    );
  }
  if (!Array.isArray(payload?.items) || payload.items.length !== 1) {
    throw new Error(
      `Reader summary fixture GET /reader-summaries expected exactly one persisted item: ${body}`,
    );
  }
  const item = payload.items[0];
  assertReaderSummaryFixtureProduct(item, body);
  return item;
};

const assertExactTitles = (records, expected, label, body) => {
  if (!Array.isArray(records) || records.length !== expected.length) {
    throw new Error(
      `Reader summary fixture expected exactly ${expected.length} ${label}: ${body}`,
    );
  }
  const titles = records.map((record) => record?.title);
  if (JSON.stringify(titles) !== JSON.stringify(expected)) {
    throw new Error(
      `Reader summary fixture ${label} titles did not match the accepted product order: ${body}`,
    );
  }
};

const assertReaderSummaryFixtureProduct = (item, body) => {
  const top = item?.readerBrief?.topReads;
  const additional = item?.readerBrief?.selectedPosts;
  assertExactTitles(top, expectedTopTitles, "top stories", body);
  assertExactTitles(
    additional,
    expectedAdditionalTitles,
    "additional stories",
    body,
  );

  const promoted = [...top, ...additional];
  const urls = promoted.map((record) => record?.canonicalUrl);
  if (
    urls.some((url) => typeof url !== "string" || url === "") ||
    new Set(urls).size !== promoted.length
  ) {
    throw new Error(
      `Reader summary fixture promoted identities must be present and deduplicated: ${body}`,
    );
  }
  const citationsById = new Map(
    (Array.isArray(item?.citations) ? item.citations : []).map((citation) => [
      citation?.citationId,
      citation,
    ]),
  );
  const identities = promoted.map((record) => {
    const citationId = Array.isArray(record?.citationIds)
      ? record.citationIds[0]
      : undefined;
    return citationsById.get(citationId)?.feedItemId;
  });
  if (
    identities.some(
      (identity) => typeof identity !== "string" || identity === "",
    ) ||
    new Set(identities).size !== promoted.length
  ) {
    throw new Error(
      `Reader summary fixture promoted feed identities must be present and deduplicated: ${body}`,
    );
  }
  const serializedPromoted = JSON.stringify(promoted);
  for (const rejectedTitle of rejectedTitles) {
    if (serializedPromoted.includes(rejectedTitle)) {
      throw new Error(
        `Reader summary fixture exposed rejected title ${JSON.stringify(rejectedTitle)}: ${body}`,
      );
    }
  }
  const serialized = JSON.stringify(item);
  if (serialized.includes(forbiddenUrl)) {
    throw new Error(
      `Reader summary fixture exposed forbidden URL ${JSON.stringify(forbiddenUrl)}: ${body}`,
    );
  }
};

export const readerSummaryFixtureScope = {
  tenantId: fixtureTenantId,
  workspaceId: fixtureWorkspaceId,
};
