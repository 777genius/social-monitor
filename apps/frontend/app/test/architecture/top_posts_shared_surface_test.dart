import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('guest and admin pages compose the same projected top posts sliver', () {
    final publishedPage = _readSummariesSource(
      'lib/src/presentation/pages/published_summary_page.dart',
    );
    final adminPage = _readSummariesSource(
      'lib/src/presentation/pages/summaries_feature_page.dart',
    );
    final sharedSection = _readSummariesSource(
      'lib/src/presentation/components/'
      'reader_summary_top_posts_section_sliver.dart',
    );

    for (final page in [publishedPage, adminPage]) {
      expect(page, contains('ReaderSummaryTopPostsSectionSliver('));
      expect(page, isNot(contains('ReaderSummaryTopPostsSliver(')));
    }
    expect(
      sharedSection,
      contains('readerSummaryTopPostsProjection(widget.summary)'),
    );
    expect(sharedSection, contains('ReaderSummaryTopPostsSliver('));
  });
}

String _readSummariesSource(String packagePath) {
  final candidates = [
    packagePath,
    'features/summaries/$packagePath',
    '../features/summaries/$packagePath',
    'apps/frontend/features/summaries/$packagePath',
  ];
  for (final path in candidates) {
    final file = File(path);
    if (file.existsSync()) {
      return file.readAsStringSync();
    }
  }
  throw StateError('Cannot locate summaries source: $packagePath');
}
