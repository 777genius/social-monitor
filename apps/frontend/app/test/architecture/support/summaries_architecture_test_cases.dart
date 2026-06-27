part of '../frontend_architecture_boundaries_test.dart';

void registerSummariesArchitectureTests() {
  test('summaries core and UI use ReaderSummary ubiquitous language', () {
    final frontendRoot = _frontendRootPath();
    final summariesRoot = '$frontendRoot/features/summaries/lib/src';
    final violations = <String>[];

    for (final file in _collectDartFiles(summariesRoot)) {
      final path = _normalizePath(file.path);
      if (!path.contains('/features/summaries/lib/src/domain/') &&
          !path.contains('/features/summaries/lib/src/application/') &&
          !path.contains('/features/summaries/lib/src/presentation/')) {
        continue;
      }

      final source = file.readAsStringSync();
      for (final forbiddenTerm in const ['readerBrief', 'ReaderBrief']) {
        if (source.contains(forbiddenTerm)) {
          violations.add('$path contains deprecated term "$forbiddenTerm"');
        }
      }
    }

    expect(violations, isEmpty);
  });

  test(
    'summaries infrastructure maps generated reader summary contract in infrastructure',
    () {
      final frontendRoot = _frontendRootPath();
      final summariesRoot = '$frontendRoot/features/summaries/lib/src';
      final violations = <String>[];
      final forbiddenFeatureLocalTerms = const [
        'deprecatedApiDto',
        'reader_summary_reader_brief',
      ];

      for (final file in _collectDartFiles(summariesRoot)) {
        final path = _normalizePath(file.path);
        final source = file.readAsStringSync();
        for (final forbiddenTerm in forbiddenFeatureLocalTerms) {
          if (source.contains(forbiddenTerm)) {
            violations.add(
              '$path contains feature-local deprecated term "$forbiddenTerm"',
            );
          }
        }
      }

      expect(violations, isEmpty);
    },
  );

  test('summaries keep provider-native metrics separate from signal score', () {
    final frontendRoot = _frontendRootPath();
    final summariesPaths = [
      '$frontendRoot/features/summaries/lib',
      '$frontendRoot/features/summaries/test',
    ];
    final violations = <String>[];
    final forbiddenMetricLabels = const [
      'Story signal',
      'Base signal',
      'Cross-source support',
      'Confirmed by',
      'Evidence items',
    ];

    for (final root in summariesPaths) {
      for (final file in _collectDartFiles(root)) {
        final path = _normalizePath(file.path);
        final source = file.readAsStringSync();
        for (final label in forbiddenMetricLabels) {
          if (source.contains(label)) {
            violations.add('$path exposes "$label" as a provider metric');
          }
        }
      }
    }

    expect(violations, isEmpty);
  });

  test(
    'summaries model reader summary score and window as domain value objects',
    () {
      final frontendRoot = _frontendRootPath();
      final summariesRoot = '$frontendRoot/features/summaries/lib/src/domain';
      final violations = <String>[];
      final requiredFiles = [
        '$summariesRoot/value_objects/signal_score.dart',
        '$summariesRoot/value_objects/summary_window.dart',
      ];

      for (final filePath in requiredFiles) {
        if (!File(filePath).existsSync()) {
          violations.add('$filePath is missing');
        }
      }

      final topReadFile = File('$summariesRoot/entities/top_read.dart');
      if (topReadFile.existsSync()) {
        final source = topReadFile.readAsStringSync();
        if (!source.contains('final SignalScore signalScore;')) {
          violations.add(
            'TopRead.signalScore must use SignalScore value object',
          );
        }
      }

      final readerSummaryFile = File(
        '$summariesRoot/aggregates/reader_summary.dart',
      );
      if (readerSummaryFile.existsSync()) {
        final source = readerSummaryFile.readAsStringSync();
        if (!source.contains('final SummaryWindow summaryWindow;')) {
          violations.add(
            'ReaderSummary must expose SummaryWindow instead of loose period text',
          );
        }
      }

      expect(violations, isEmpty);
    },
  );
}
