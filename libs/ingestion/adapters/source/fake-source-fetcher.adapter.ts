import type { FetchSourceItemsCommand, FetchedSourceItem, SourceFetcherPort } from '../../ports';

export class FakeSourceFetcherAdapter implements SourceFetcherPort {
  async fetch(command: FetchSourceItemsCommand): Promise<readonly FetchedSourceItem[]> {
    const publishedAt = new Date('2026-01-01T00:00:00.000Z');

    return [
      {
        externalId: `${command.sourceBindingId}:fake-post-1`,
        canonicalUrl: `https://example.test/source/${command.sourceBindingId}/fake-post-1`,
        title: 'Fake source post 1',
        body: `First deterministic item for scan ${command.scanJobId}`,
        authorHandle: 'fake-author',
        publishedAt,
      },
      {
        externalId: `${command.sourceBindingId}:fake-post-2`,
        canonicalUrl: `https://example.test/source/${command.sourceBindingId}/fake-post-2`,
        title: 'Fake source post 2',
        body: `Second deterministic item for scan ${command.scanJobId}`,
        authorHandle: 'fake-author',
        publishedAt,
      },
    ];
  }
}
