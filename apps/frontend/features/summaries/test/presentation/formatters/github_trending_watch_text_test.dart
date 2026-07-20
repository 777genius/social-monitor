import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/presentation/formatters/github_trending_watch_text.dart';

void main() {
  test('deduplicates legacy Watch text before selecting visible top three', () {
    final lines = formatGitHubTrendingWatchLines(
      '• Watch: '
      '• codecrafters-io/build-your-own-x: +1,126 stars today. '
      '• CODECRAFTERS-IO/build-your-own-x: +1,068 stars today. '
      '• example/current: +1,100 stars today. '
      '• example/current: +1,100 stars today. '
      '• example/third: +1,050 stars today. '
      '• example/fourth: +1,040 stars today. '
      '• example/boundary: +1,000 stars today.',
    );

    expect(
      lines.map((line) => line.visibleText),
      equals([
        'codecrafters-io/build-your-own-x: +1,126 stars today.',
        'example/current: +1,100 stars today.',
        'example/third: +1,050 stars today.',
      ]),
    );
    expect(lines.map((line) => line.repositoryIdentity), [
      'codecrafters-io/build-your-own-x',
      'example/current',
      'example/third',
    ]);
  });

  test('strips markdown structure into readable repository lines', () {
    final lines = formatGitHubTrendingWatchLines(
      '- **OpenCut-app/OpenCut**: +1,229 stars today.\n'
      '- **HKUDS/Vibe-Trading**: +1,153 stars today.',
    );

    expect(lines, hasLength(2));
    expect(lines.first.repository, 'OpenCut-app/OpenCut');
    expect(lines.first.visibleText, isNot(contains('**')));
    expect(lines.first.visibleText, isNot(startsWith('•')));
  });

  test('normalizes canonical GitHub repository citation URLs', () {
    expect(
      normalizedGitHubRepositoryUrlIdentity(
        'https://github.com/Codecrafters-io/build-your-own-x.git/?ref=daily',
      ),
      'codecrafters-io/build-your-own-x',
    );
    expect(
      normalizedGitHubRepositoryUrlIdentity(
        'https://github.com/owner/repo/issues/1',
      ),
      isNull,
    );
    expect(
      normalizedGitHubRepositoryUrlIdentity('https://example.test/owner/repo'),
      isNull,
    );
  });
}
