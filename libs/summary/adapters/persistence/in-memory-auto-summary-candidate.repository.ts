import type { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';

import type { SummaryJob } from '../../domain';
import type { AutoSummaryCandidate, AutoSummaryCandidateRepositoryPort } from '../../ports';
import type { InMemorySummaryJobRepository } from './in-memory-summary-job.repository';
import type { InMemorySummaryPolicyRepository } from './in-memory-summary-policy.repository';

export class InMemoryAutoSummaryCandidateRepository implements AutoSummaryCandidateRepositoryPort {
  constructor(
    private readonly policies: InMemorySummaryPolicyRepository,
    private readonly summaryJobs: InMemorySummaryJobRepository,
    private readonly feedItems: InMemoryFeedItemReadRepository,
  ) {}

  async findDueCandidates(
    params: Parameters<AutoSummaryCandidateRepositoryPort['findDueCandidates']>[0],
  ): Promise<readonly AutoSummaryCandidate[]> {
    const summaryJobs = this.summaryJobs.all();
    const candidates = this.policies.all()
      .flatMap((policy): readonly AutoSummaryCandidate[] => {
        const snapshot = policy.toSnapshot();

        if (params.tenantId !== undefined && snapshot.tenantId !== params.tenantId) {
          return [];
        }
        if (params.workspaceId !== undefined && snapshot.workspaceId !== params.workspaceId) {
          return [];
        }

        const latestSummaryRequestedAt = latestTopicSummaryRequestedAt(summaryJobs, {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          topicId: snapshot.topicId,
        });
        const dueFeedItems = this.feedItems.all()
          .map((item) => item.toSnapshot())
          .filter((item) =>
            item.tenantId === snapshot.tenantId &&
            item.workspaceId === snapshot.workspaceId &&
            item.topicId === snapshot.topicId &&
            item.observedAt.getTime() <= params.latestFeedItemObservedBefore.getTime() &&
            (latestSummaryRequestedAt === undefined || item.observedAt.getTime() > latestSummaryRequestedAt.getTime()),
          );

        if (dueFeedItems.length === 0) {
          return [];
        }

        return [{
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          topicId: snapshot.topicId,
          latestFeedItemObservedAt: maxDate(dueFeedItems.map((item) => item.observedAt)),
          newFeedItemCount: dueFeedItems.length,
          latestSummaryRequestedAt,
        }];
      })
      .sort((left, right) =>
        left.latestFeedItemObservedAt.getTime() - right.latestFeedItemObservedAt.getTime() ||
        left.topicId.localeCompare(right.topicId),
      );

    return candidates.slice(0, params.limit);
  }
}

const latestTopicSummaryRequestedAt = (
  jobs: readonly SummaryJob[],
  params: { readonly tenantId: string; readonly workspaceId: string; readonly topicId: string },
): Date | undefined => {
  const requestedAtValues = jobs
    .map((job) => job.toSnapshot())
    .filter((job) =>
      job.tenantId === params.tenantId &&
      job.workspaceId === params.workspaceId &&
      job.topicId === params.topicId &&
      job.userId === undefined &&
      job.subscriptionId === undefined,
    )
    .map((job) => job.requestedAt);

  return requestedAtValues.length === 0 ? undefined : maxDate(requestedAtValues);
};

const maxDate = (values: readonly Date[]): Date =>
  values.reduce((latest, current) => current.getTime() > latest.getTime() ? current : latest);
