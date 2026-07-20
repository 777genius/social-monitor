import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/top_posts_test_fixtures.dart';

void main() {
  test('keeps the exact editorial eight and dedupes continuation in order', () {
    final curated = [
      for (var index = 0; index < 8; index += 1)
        topPostFixture(
          title: 'Editorial $index',
          canonicalUrl: index < 2
              ? 'https://news.example/shared-editorial'
              : 'https://news.example/editorial/$index',
        ),
    ];
    final legacy = [
      topPostFixture(
        title: 'Legacy duplicate of curated',
        canonicalUrl: 'https://news.example/shared-editorial/',
      ),
      topPostFixture(
        title: 'Legacy position 10',
        canonicalUrl: 'https://news.example/legacy/10',
      ),
    ];
    final summary = topPostsSummaryFixture(
      topReads: [
        topPostFixture(
          title: 'owner/separate-board',
          providerKey: readerSummaryGitHubTrendingProviderKey,
          canonicalUrl: 'https://github.com/owner/separate-board',
          githubRank: 4,
        ),
        ...curated,
        ...legacy,
      ],
      selectedPosts: [
        topPostFixture(
          title: 'Selected duplicate of curated',
          canonicalUrl:
              'https://NEWS.example/shared-editorial?utm_source=selected',
        ),
        topPostFixture(
          title: 'Selected duplicate of legacy',
          canonicalUrl: 'https://news.example/legacy/10/',
        ),
        topPostFixture(title: 'Selected A'),
        topPostFixture(title: '  selected   a  ', providerKey: ' REDDIT '),
        topPostFixture(title: 'Selected B'),
      ],
    );

    final projection = readerSummaryTopPostsProjection(summary);

    expect(projection.curatedPosts.map((item) => item.title), [
      for (var index = 0; index < 8; index += 1) 'Editorial $index',
    ]);
    expect(projection.continuationPosts.map((item) => item.title), [
      'Legacy position 10',
      'Selected A',
      'Selected B',
    ]);
    expect(projection.posts, hasLength(11));
    expect(projection.githubTrendingPosts.single.title, 'owner/separate-board');
  });

  test(
    'normalizes canonical tracking, invalid URLs, and fallback identity',
    () {
      final canonical = topPostFixture(
        title: 'Canonical original',
        canonicalUrl:
            'HTTPS://News.Example/story/?story=7&utm_source=feed&'
            'UTM_CAMPAIGN=launch&fbclid=a&gclid=b&igshid=c&mc_cid=d&mc_eid=e',
      );
      final canonicalDuplicate = topPostFixture(
        title: 'Canonical duplicate',
        canonicalUrl: 'https://news.example/story?story=7#reader',
      );
      final github = topPostFixture(
        title: 'owner/repository',
        providerKey: readerSummaryGitHubTrendingProviderKey,
        canonicalUrl: 'https://github.com/owner/repository?ref=trending',
      );
      final githubWithoutRef = topPostFixture(
        title: 'owner/repository alternate',
        providerKey: readerSummaryGitHubTrendingProviderKey,
        canonicalUrl: 'https://github.com/owner/repository',
      );
      final invalid = topPostFixture(
        title: 'Invalid URL original',
        canonicalUrl: '  NOT   A VALID URL  ',
      );
      final invalidDuplicate = topPostFixture(
        title: 'Invalid URL duplicate',
        canonicalUrl: 'not a valid url',
      );
      final fallback = topPostFixture(title: '  Same   Headline  ');
      final fallbackDuplicate = topPostFixture(
        title: 'same headline',
        providerKey: ' REDDIT ',
      );

      expect(
        readerSummaryTopPostIdentity(canonical),
        readerSummaryTopPostIdentity(canonicalDuplicate),
      );
      expect(
        readerSummaryTopPostIdentity(github),
        readerSummaryTopPostIdentity(githubWithoutRef),
      );
      expect(
        readerSummaryTopPostIdentity(invalid),
        readerSummaryTopPostIdentity(invalidDuplicate),
      );
      expect(
        readerSummaryTopPostIdentity(fallback),
        readerSummaryTopPostIdentity(fallbackDuplicate),
      );
    },
  );

  test('dedupes GitHub by first repository occurrence before rank and cap', () {
    final topReads = [
      topPostFixture(
        title: 'Owner/Repo-A first occurrence',
        providerKey: readerSummaryGitHubTrendingProviderKey,
        canonicalUrl: 'https://github.com/Owner/Repo-A',
        githubRank: 5,
      ),
      topPostFixture(
        title: 'owner/tie-first',
        providerKey: readerSummaryGitHubTrendingProviderKey,
        canonicalUrl: 'https://github.com/owner/tie-first',
        githubRank: 3,
      ),
      for (var rank = 4; rank <= 12; rank += 1)
        topPostFixture(
          title: 'owner/repo-$rank',
          providerKey: readerSummaryGitHubTrendingProviderKey,
          canonicalUrl: 'https://github.com/owner/repo-$rank',
          githubRank: rank,
        ),
    ];
    final summary = topPostsSummaryFixture(
      topReads: topReads,
      selectedPosts: [
        topPostFixture(
          title: 'owner/repo-a later better rank',
          providerKey: readerSummaryGitHubTrendingProviderKey,
          canonicalUrl: 'https://github.com/owner/repo-a/issues/7?ref=issue',
          githubRank: 2,
        ),
        topPostFixture(
          title: 'owner/repo-1',
          providerKey: readerSummaryGitHubTrendingProviderKey,
          canonicalUrl: 'https://github.com/owner/repo-1',
          githubRank: 1,
        ),
        topPostFixture(
          title: 'owner/tie-second',
          providerKey: readerSummaryGitHubTrendingProviderKey,
          canonicalUrl: 'https://github.com/owner/tie-second',
          githubRank: 3,
        ),
      ],
    );

    final github = readerSummaryTopPostsProjection(summary).githubTrendingPosts;

    expect(github, hasLength(10));
    expect(github.take(5).map((item) => item.title), [
      'owner/repo-1',
      'owner/tie-first',
      'owner/tie-second',
      'owner/repo-4',
      'Owner/Repo-A first occurrence',
    ]);
    expect(
      github.map((item) => item.title),
      isNot(contains('owner/repo-a later better rank')),
    );
    expect(github.map((item) => item.title), isNot(contains('owner/repo-10')));
    expect(
      github.where(
        (item) => readerSummaryGitHubRepositoryIdentity(item) == 'owner/repo-a',
      ),
      hasLength(1),
    );
  });

  test('recognizes an incidental equal-dataset rebuild', () {
    ReaderSummaryTopPostsProjection project({bool append = false}) {
      return readerSummaryTopPostsProjection(
        topPostsSummaryFixture(
          topReads: [
            for (var index = 0; index < 9; index += 1)
              topPostFixture(
                title: 'Editorial $index',
                canonicalUrl: 'https://news.example/$index',
              ),
          ],
          selectedPosts: [
            topPostFixture(title: 'Selected A'),
            if (append) topPostFixture(title: 'Selected B'),
          ],
        ),
      );
    }

    expect(project().hasSameDatasetAs(project()), isTrue);
    expect(project().hasSameDatasetAs(project(append: true)), isFalse);
  });
}
