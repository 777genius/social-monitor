import "reflect-metadata";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { MonitoringRestModule } from "@social-monitor/monitoring/interfaces/rest/monitoring-rest.module";
import { MONITORING_INTEREST_REPOSITORY } from "@social-monitor/monitoring/interfaces/rest/monitoring-provider-tokens";
import { Interest } from "@social-monitor/monitoring/domain";
import { InMemoryInterestRepository } from "@social-monitor/monitoring/adapters/persistence/in-memory-interest.repository";
import { CONFIGURED_INTEREST_READER, type ConfiguredInterestReaderPort } from "../../ports";
import { InMemoryUserRelevanceProfileRepository } from "../../adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "../../features/rank-feed-items/rank-feed-items.use-case";
import { scope, now } from "../../features/rank-feed-items/rank-promotion-topic-context.spec-support";
import { RelevanceRestModule } from "./relevance-rest.module";

describe("REST configured interest composition", () => {
  it("wires the existing Monitoring repository into the Relevance capability and ranking constructor", async () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, RelevanceRestModule) as Array<{
      provide?: unknown; inject?: unknown[]; useFactory: (...args: unknown[]) => unknown;
    }>;
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, RelevanceRestModule)).toContain(MonitoringRestModule);
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, MonitoringRestModule)).toContain(MONITORING_INTEREST_REPOSITORY);
    const provider = providers.find((provider) => provider.provide === CONFIGURED_INTEREST_READER)!;
    expect(provider.inject).toEqual([MONITORING_INTEREST_REPOSITORY]);
    const interests = new InMemoryInterestRepository();
    await interests.save(Interest.create({ ...scope, id: scope.interestId, name: "Fixture", query: "best", createdAt: now }));
    const reader = provider.useFactory(interests) as ConfiguredInterestReaderPort;
    expect(await reader.readCurrent(scope)).toMatchObject({ kind: "available", interest: { query: "best" } });
    const ranking = providers.find((provider) => provider.provide === RankFeedItemsUseCase)!;
    expect(ranking.inject?.at(-1)).toBe(CONFIGURED_INTEREST_READER);
    const readCurrent = jest.spyOn(reader, "readCurrent");
    const useCase = ranking.useFactory({ list: async () => ({ items: [] }), findById: async () => null,
      readPromotionSnapshot: async () => ({ ok: true, exhausted: true, physicalRowsRead: 0, candidates: [], sourceContent: [] }) },
    new InMemoryUserRelevanceProfileRepository(), undefined, undefined, reader) as RankFeedItemsUseCase;
    const result = await useCase.execute({ ...scope, rankingProfile: "reader_post_promotion", limit: 10,
      publishedAtOrAfter: now, publishedBefore: new Date("2026-09-09T00:00:00Z") });
    expect(result.ok).toBe(true);
    expect(readCurrent).not.toHaveBeenCalled();
  });
});
