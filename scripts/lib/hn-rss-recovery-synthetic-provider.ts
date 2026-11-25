/** Test-only provider clients. This module is never imported by the production CLI. */
import { HackerNewsSourceProvider } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-source.provider";
import type { HackerNewsClientPort, HackerNewsStory } from "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-client.port";
import { RssSourceProvider } from "@social-monitor/ingestion/adapters/source/rss/rss-source.provider";
import type { RssClientPort } from "@social-monitor/ingestion/adapters/source/rss/rss-client.port";
import type { SourceProviderPort } from "@social-monitor/ingestion/ports";
import { SystemClock } from "@social-monitor/shared-kernel";

import type { RecoveryProvider } from "./hn-rss-recovery-plan";

export const syntheticHnIdForBinding = (sourceBindingId: string): number =>
  1_000_000 + Number.parseInt(sourceBindingId.replace(/-/g, "").slice(0, 12), 16);
export const syntheticRssGuidForBinding = (sourceBindingId: string): string =>
  `synthetic-rss-${sourceBindingId}`;

class SyntheticHackerNewsClient implements HackerNewsClientPort {
  constructor(private readonly sourceBindingId: string) {}
  async searchStories(): Promise<readonly HackerNewsStory[]> {
    const id = syntheticHnIdForBinding(this.sourceBindingId);
    return [{ kind: "story", id, title: "Synthetic recovery proof", url: `https://example.test/hn/${id}`, time: Date.parse("2026-09-23T16:30:00.000Z") / 1000, score: 3 }];
  }
  async searchComments(): Promise<readonly HackerNewsStory[]> { return []; }
  async getStory(): Promise<HackerNewsStory | null> { return null; }
  async listStoryComments(): Promise<readonly HackerNewsStory[]> { return []; }
  async listStories(): Promise<readonly HackerNewsStory[]> { throw new Error("Synthetic recovery used live listing"); }
}

class SyntheticRssClient implements RssClientPort {
  constructor(private readonly sourceBindingId: string) {}
  async readFeed() {
    return { items: [{ guid: syntheticRssGuidForBinding(this.sourceBindingId), link: `https://example.test/rss/${this.sourceBindingId}`, title: "Synthetic RSS recovery", publishedAt: new Date("2026-09-23T16:30:00.000Z") }] };
  }
}

export const syntheticRecoveryProvider = (provider: RecoveryProvider, sourceBindingId: string): SourceProviderPort =>
  provider === "hacker-news"
    ? new HackerNewsSourceProvider(new SyntheticHackerNewsClient(sourceBindingId), new SystemClock())
    : new RssSourceProvider(new SyntheticRssClient(sourceBindingId));
