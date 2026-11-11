import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { emptyToUndefined } from "./durable-backend-e2e-config.ts";
import { createDurableScanTargets } from "./durable-backend-e2e-scan-targets.ts";

function fixture(values = {}) {
  const runtime = { env: { ...values } };
  const plans = createDurableScanTargets({ process: runtime, emptyToUndefined });
  return { runtime, ...plans };
}

test("missing Reddit app-only credentials fail closed before selecting targets", () => {
  const invalid = [
    {},
    { REDDIT_APP_CLIENT_ID: "app" },
    { REDDIT_APP_CLIENT_SECRET: "secret" },
    { REDDIT_APP_CLIENT_ID: "   ", REDDIT_APP_CLIENT_SECRET: "secret" },
  ];
  for (const values of invalid) {
    assert.throws(() => fixture(values).durableScanTargets(),
      /REDDIT_APP_CLIENT_ID and REDDIT_APP_CLIENT_SECRET are required because durable backend E2E must scan Reddit/);
  }
});

test("durable scan targets retain exact provider ordering and safe defaults", () => {
  const values = { REDDIT_APP_CLIENT_ID: "app", REDDIT_APP_CLIENT_SECRET: "secret" };
  const selected = fixture(values).durableScanTargets();
  assert.deepEqual(selected.map((target) => target.providerKey),
    ["hacker-news", "github-issues", "github-trending-page", "reddit", "rss"]);
  assert.deepEqual(selected[0].config, { mode: "search", query: "monitoring", maxItems: 2 });
  assert.deepEqual(selected[1].config, {
    query: "repo:microsoft/TypeScript is:issue",
    maxItems: 2,
    userAgent: "social-monitor-mvp/0.1 github-live-smoke",
  });
  assert.deepEqual(selected[2].config, {
    window: "daily", language: "python", maxItems: 3,
    userAgent: "social-monitor-mvp/0.1 github-trending-page",
  });
  assert.deepEqual(selected[3].config, {
    mode: "listing", subreddit: "programming", listing: "hot", maxItems: 2,
    userAgent: "social-monitor-mvp/0.1 reddit-app-only",
  });
  assert.deepEqual(selected[4].config, {
    feedUrl: "https://hnrss.org/frontpage", maxItems: 2,
  });
});

test("GitHub token and user-agent precedence retain original trim and omission policy", () => {
  const values = {
    REDDIT_APP_CLIENT_ID: "app",
    REDDIT_APP_CLIENT_SECRET: "secret",
    GITHUB_ACCESS_TOKEN: "  test-token  ",
    GITHUB_USER_AGENT: "  shared-agent  ",
    GITHUB_TRENDING_PAGE_USER_AGENT: "  trending-agent  ",
  };
  const f = fixture(values);
  const first = f.durableScanTargets();
  assert.equal(first[1].config.accessToken, "test-token");
  assert.equal(first[1].config.userAgent, "shared-agent");
  assert.equal(first[2].config.userAgent, "trending-agent");
  f.runtime.env.GITHUB_ACCESS_TOKEN = "  ";
  f.runtime.env.GITHUB_TRENDING_PAGE_USER_AGENT = "  ";
  const next = f.durableScanTargets();
  assert.equal(Object.hasOwn(next[1].config, "accessToken"), false);
  assert.equal(next[2].config.userAgent, "shared-agent");
});

test("Reddit user-agent precedence remains nullish, not truthy or trimmed", () => {
  const f = fixture({
    REDDIT_APP_CLIENT_ID: "app", REDDIT_APP_CLIENT_SECRET: "secret",
    REDDIT_APP_USER_AGENT: "", REDDIT_USER_AGENT: "fallback",
  });
  assert.equal(f.durableScanTargets()[3].config.userAgent, "");
  delete f.runtime.env.REDDIT_APP_USER_AGENT;
  assert.equal(f.durableScanTargets()[3].config.userAgent, "fallback");
});

test("target selection reads the original mutable process.env at invocation time", () => {
  const f = fixture({});
  assert.throws(() => f.durableScanTargets(), /REDDIT_APP_CLIENT_ID/);
  f.runtime.env.REDDIT_APP_CLIENT_ID = "new-app";
  f.runtime.env.REDDIT_APP_CLIENT_SECRET = "new-secret";
  assert.equal(f.durableScanTargets().length, 5);
  f.runtime.env.REDDIT_APP_CLIENT_SECRET = "";
  assert.throws(() => f.durableScanTargets(), /REDDIT_APP_CLIENT_SECRET/);
});

test("scheduled RSS scan target remains deterministic and independent of credentials", () => {
  const selected = fixture({}).scheduledScanTarget();
  assert.deepEqual(selected, {
    providerKey: "rss",
    config: { feedUrl: "https://hnrss.org/newest", maxItems: 2 },
  });
});

test("original runner retains exactly one active delegation without duplicate implementations", () => {
  const source = readFileSync(new URL("../capture-durable-backend-e2e-loop.ts", import.meta.url), "utf8");
  assert.match(source, /createDurableScanTargets\(\{ process, emptyToUndefined \}\)/);
  assert.match(source, /import \{ createDurableScanTargets, type DurableScanProviderKey, type DurableScanTarget \}/);
  assert.doesNotMatch(source, /function (durableScanTargets|scheduledScanTarget|hasRedditAppOnlyCredentials)\(/);
});
