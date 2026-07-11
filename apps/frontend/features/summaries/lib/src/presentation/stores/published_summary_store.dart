import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/open_reader_source_command.dart';
import '../../application/queries/load_published_summary_query.dart';
import '../../application/queries/load_workspace_summary_query.dart';
import '../../application/use_cases/load_published_summary_use_case.dart';
import '../../application/use_cases/load_workspace_summary_use_case.dart';
import '../../application/use_cases/open_reader_source_use_case.dart';
import '../../domain/aggregates/reader_summary.dart';

final class PublishedSummaryStore extends ChangeNotifier {
  PublishedSummaryStore({
    required WorkspaceScope scope,
    required LoadWorkspaceSummaryUseCase loadLatest,
    required LoadPublishedSummaryUseCase loadPublished,
    required OpenReaderSourceUseCase openReaderSource,
    this.summaryId,
    OperationGenerationGuard? generationGuard,
  }) : _scope = scope,
       _loadLatest = loadLatest,
       _loadPublished = loadPublished,
       _openReaderSource = openReaderSource,
       _generationGuard = generationGuard ?? OperationGenerationGuard();

  final WorkspaceScope _scope;
  final LoadWorkspaceSummaryUseCase _loadLatest;
  final LoadPublishedSummaryUseCase _loadPublished;
  final OpenReaderSourceUseCase _openReaderSource;
  final OperationGenerationGuard _generationGuard;
  final String? summaryId;

  AsyncViewState<ReaderSummary> state = const InitialViewState<ReaderSummary>();

  Future<void> load() async {
    final generation = _generationGuard.markOperationStarted();
    final previous = switch (state) {
      ReadyViewState<ReaderSummary>(:final value) => value,
      LoadingViewState<ReaderSummary>(:final previousValue) => previousValue,
      _ => null,
    };
    state = LoadingViewState<ReaderSummary>(previousValue: previous);
    notifyListeners();

    final requestedId = summaryId?.trim();
    final result = requestedId != null && requestedId.isNotEmpty
        ? await _loadPublished(
            LoadPublishedSummaryQuery(scope: _scope, summaryId: requestedId),
          )
        : await _loadLatest(
            LoadWorkspaceSummaryQuery(
              scope: _scope,
              period: SummaryPeriodPreset.daily.resolve(),
            ),
          );
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }
    state = result.fold(
      onSuccess: (snapshot) {
        final summary = snapshot.current;
        return summary == null
            ? const EmptyViewState<ReaderSummary>(
                reason: 'No published daily summary is available yet.',
              )
            : ReadyViewState<ReaderSummary>(
                summary,
                isDegraded: summary.isDegraded,
              );
      },
      onFailure: (failure) => FailureViewState<ReaderSummary>(failure: failure),
    );
    notifyListeners();
  }

  Future<void> openUrl(String canonicalUrl) async {
    final current = switch (state) {
      ReadyViewState<ReaderSummary>(:final value) => value,
      _ => null,
    };
    if (current == null) {
      return;
    }
    await _openReaderSource(
      OpenReaderSourceCommand(
        summaryId: current.id,
        kind: 'read_source',
        label: 'Open source',
        canonicalUrl: canonicalUrl,
        idempotencyKey: '${current.id}:public-source:${canonicalUrl.hashCode}',
      ),
    );
  }

  @override
  void dispose() {
    _generationGuard.invalidate();
    super.dispose();
  }
}
