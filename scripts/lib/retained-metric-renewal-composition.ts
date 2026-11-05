import { CryptoIdGenerator, type Clock } from "@social-monitor/shared-kernel";
import { PrismaSourceEngagementProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-projection.adapter";
import type { PrismaSourceEngagementClient } from "@social-monitor/feed/adapters/persistence/prisma/prisma-source-engagement-client";
import { PrismaRetainedMetricInventory, type PrismaMetricInventoryClient } from "@social-monitor/ingestion/adapters/persistence/prisma-retained-metric-inventory";
import { HttpHackerNewsClient } from "@social-monitor/ingestion/adapters/source/hacker-news/http-hacker-news-client";
import { HttpRedditClient } from "@social-monitor/ingestion/adapters/source/reddit/http-reddit-client";
import { RedditAppOnlyTokenProvider } from "@social-monitor/ingestion/adapters/source/reddit/app-only-reddit-token-provider";
import { RetainedMetricFetchAdapter } from "@social-monitor/ingestion/adapters/source/retained-metric-fetch.capability";
import { sameTarget } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-admission";
import type { MetricRefreshManifest } from "@social-monitor/ingestion/features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { metricRefreshDigest as hash } from "./retained-metric-refresh-receipts";

export function retainedMetricRenewalEffects(client: PrismaMetricInventoryClient & PrismaSourceEngagementClient,
  manifest: Pick<MetricRefreshManifest, "targets" | "scope"> | null, clock: Clock, env: NodeJS.ProcessEnv) {
  const projection = new PrismaSourceEngagementProjectionAdapter(client, new CryptoIdGenerator(), {
    retention: "skip", sampleGuard: async (transaction, _command, sample) => {
      const expected = manifest?.targets.find((t) => t.sourceItemId === sample.sourceItemId);
      const guarded = new PrismaRetainedMetricInventory(transaction as unknown as PrismaMetricInventoryClient, hash);
      if (!expected || !sameTarget(expected, await guarded.read(manifest!.scope, expected.sourceItemId), hash)) throw new Error("Transactional renewal target drift");
    },
  });
  let tokenProvider: RedditAppOnlyTokenProvider | undefined;
  const token = { getAccessToken: async () => {
    tokenProvider ??= new RedditAppOnlyTokenProvider({ clientId: env.REDDIT_APP_CLIENT_ID ?? "", clientSecret: env.REDDIT_APP_CLIENT_SECRET ?? "",
      userAgent: env.REDDIT_APP_USER_AGENT, timeoutMs: 10_000, now: () => clock.now().getTime() });
    return tokenProvider.getAccessToken();
  } };
  const fetcher = new RetainedMetricFetchAdapter(new HttpHackerNewsClient(10_000), new HttpRedditClient("https://oauth.reddit.com", 10_000), token,
    env.REDDIT_APP_USER_AGENT ?? "social-monitor-retained-metrics/1");
  return { projection, fetcher };
}
