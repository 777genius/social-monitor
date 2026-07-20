import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import '../../support/top_posts_test_fixtures.dart';

void main() {
  test('dedupes the full editorial sequence before taking eight', () {
    final curated = [
      for (var index = 0; index < 8; index += 1)
        topPostFixture(
          title: 'Editorial $index',
          canonicalUrl: index < 2
              ? 'https://news.example/shared-editorial'
              : 'https://news.example/editorial/$index',
        ),
    ];
    final summary = topPostsSummaryFixture(
      topReads: [
        ...curated,
        topPostFixture(
          title: 'Legacy duplicate of curated',
          canonicalUrl: 'https://news.example/shared-editorial/',
        ),
        topPostFixture(
          title: 'Legacy position 10',
          canonicalUrl: 'https://news.example/legacy/10',
        ),
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
      'Editorial 0',
      for (var index = 2; index < 8; index += 1) 'Editorial $index',
      'Legacy position 10',
    ]);
    expect(projection.continuationPosts.map((item) => item.title), [
      'Selected A',
      'Selected B',
    ]);
    expect(projection.curatedPosts, hasLength(8));
    expect(projection.posts, hasLength(10));
    expect(
      projection.posts.map(readerSummaryTopPostIdentity).toSet(),
      hasLength(projection.posts.length),
    );
    expect(projection.githubTrendingPosts, isEmpty);
  });

  test('fills eight unique initial posts from selected continuation', () {
    final summary = topPostsSummaryFixture(
      topReads: [
        topPostFixture(
          title: 'Curated 0',
          canonicalUrl: 'https://news.example/curated/0',
        ),
        topPostFixture(
          title: 'Duplicate curated 0',
          canonicalUrl: 'https://news.example/curated/0/',
        ),
        for (var index = 1; index < 3; index += 1)
          topPostFixture(
            title: 'Curated $index',
            canonicalUrl: 'https://news.example/curated/$index',
          ),
      ],
      selectedPosts: [
        topPostFixture(
          title: 'Selected duplicate of curated',
          canonicalUrl: 'https://news.example/curated/0?utm_source=selected',
        ),
        for (var index = 0; index < 9; index += 1)
          topPostFixture(
            title: 'Selected $index',
            canonicalUrl: 'https://news.example/selected/$index',
          ),
      ],
    );

    final projection = readerSummaryTopPostsProjection(summary);

    expect(projection.curatedPosts.map((item) => item.title), [
      'Curated 0',
      'Curated 1',
      'Curated 2',
    ]);
    expect(projection.posts.take(8).map((item) => item.title), [
      'Curated 0',
      'Curated 1',
      'Curated 2',
      for (var index = 0; index < 5; index += 1) 'Selected $index',
    ]);
    expect(projection.posts, hasLength(12));
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
        readerSummaryTopPostIdentity(invalid),
        readerSummaryTopPostIdentity(invalidDuplicate),
      );
      expect(
        readerSummaryTopPostIdentity(fallback),
        readerSummaryTopPostIdentity(fallbackDuplicate),
      );
    },
  );

  test('uses selectedPosts as the exclusive fail-closed GitHub source', () {
    final topReadBoard = _githubBoard(prefix: 'top-read');
    final selectedBoard = _githubBoard(prefix: 'selected');
    final projection = readerSummaryTopPostsProjection(
      topPostsSummaryFixture(
        topReads: topReadBoard,
        selectedPosts: selectedBoard,
      ),
    );

    expect(projection.posts, isEmpty);
    expect(projection.githubTrendingPosts.map((item) => item.title), [
      for (var rank = 1; rank <= 10; rank += 1) 'selected/repo-$rank',
    ]);

    final partialSelected = readerSummaryTopPostsProjection(
      topPostsSummaryFixture(
        topReads: topReadBoard,
        selectedPosts: selectedBoard.take(9).toList(growable: false),
      ),
    );
    expect(partialSelected.githubTrendingPosts, isEmpty);
  });

  test('does not repair a missing selectedPosts board from topReads', () {
    final projection = readerSummaryTopPostsProjection(
      topPostsSummaryFixture(topReads: _githubBoard(prefix: 'fallback')),
    );

    expect(projection.posts, isEmpty);
    expect(projection.githubTrendingPosts, isEmpty);
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

  test('treats a source-order change as a new dataset', () {
    ReaderSummaryTopPostsProjection project(List<String> titles) {
      return readerSummaryTopPostsProjection(
        topPostsSummaryFixture(
          topReads: [
            for (final title in titles)
              topPostFixture(
                title: title,
                canonicalUrl: 'https://news.example/$title',
              ),
          ],
        ),
      );
    }

    expect(
      project(const [
        'first',
        'second',
      ]).hasSameDatasetAs(project(const ['second', 'first'])),
      isFalse,
    );
  });
}

List<TopRead> _githubBoard({required String prefix}) {
  return [
    for (var rank = 1; rank <= 10; rank += 1)
      topPostFixture(
        title: '$prefix/repo-$rank',
        providerKey: readerSummaryGitHubTrendingProviderKey,
        canonicalUrl: 'https://github.com/$prefix/repo-$rank',
        githubRank: rank,
        citationIds: ['$prefix-citation-$rank'],
      ),
  ];
}
