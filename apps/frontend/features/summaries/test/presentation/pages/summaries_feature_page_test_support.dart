part of 'summaries_feature_page_test.dart';

void _registerCompactFailureAndEmptyStateTest() {
  testWidgets('compact failure and empty summary states stay visible', (
    tester,
  ) async {
    final failedStore = _store([summaryApiDto()]);
    failedStore.workspaceSummaryState =
        const FailureViewState<WorkspaceSummarySnapshot>(
          failure: UnexpectedFailure(
            message: 'Provider evidence unavailable',
            code: 'summaries.provider_failed',
          ),
        );

    await _pumpSizedFeature(
      tester,
      store: failedStore,
      size: const Size(390, 780),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('Summary unavailable'), findsOneWidget);
    expect(find.text('Provider evidence unavailable'), findsOneWidget);

    final emptyStore = _store([]);
    emptyStore.workspaceSummaryState =
        const EmptyViewState<WorkspaceSummarySnapshot>(
          reason: 'summaries.empty',
        );

    await _pumpSizedFeature(
      tester,
      store: emptyStore,
      size: const Size(390, 780),
      autoload: false,
    );
    await tester.pumpAndSettle();

    expect(find.text('No workspace summary'), findsOneWidget);
    expect(
      find.text('Run a workspace summary after feed items are collected.'),
      findsOneWidget,
    );
  });
}

SummariesReviewStore _store(
  List<SummaryApiDto> items, {
  ReaderSummaryApiDto? workspaceSummary,
}) {
  final catalog = GeneratedSummaryReviewCatalog(
    apiClient: InMemorySummariesApiClient(
      items: items,
      workspaceSummary: workspaceSummary,
    ),
  );
  return SummariesReviewStore(
    dependencies: SummariesReviewStoreDependencies(
      listSummaries: ListSummariesUseCase(catalog),
      loadWorkspaceSummary: LoadWorkspaceSummaryUseCase(catalog),
      loadWorkspaceSummaryHistory: LoadWorkspaceSummaryHistoryUseCase(catalog),
      requestWorkspaceSummary: RequestWorkspaceSummaryUseCase(catalog),
      loadWorkspaceSummaryJobStatus: LoadWorkspaceSummaryJobStatusUseCase(
        catalog,
      ),
      loadSummaryDetail: LoadSummaryDetailUseCase(catalog),
      loadTopicRecommendations: LoadTopicRecommendationsUseCase(catalog),
      decideTopicRecommendation: DecideTopicRecommendationUseCase(catalog),
      loadPostRatings: LoadPostRatingsUseCase(catalog),
      regenerateSummary: RegenerateSummaryUseCase(catalog),
      submitFeedback: SubmitSummaryFeedbackUseCase(catalog),
      submitPostRating: SubmitPostRatingUseCase(catalog),
      submitReaderAction: SubmitReaderActionUseCase(catalog),
      openReaderSource: const OpenReaderSourceUseCase(
        _FakeReaderSourceLauncher(),
      ),
    ),
    scope: summaryWorkspaceScope,
    userId: 'user-test',
    summaryPollInterval: Duration.zero,
  );
}

final class _FakeReaderSourceLauncher implements ReaderSourceLauncher {
  const _FakeReaderSourceLauncher();

  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}

Future<void> _pumpSizedFeature(
  WidgetTester tester, {
  required SummariesReviewStore store,
  required Size size,
  bool autoload = true,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);

  final theme = AppTheme.light();
  await tester.pumpWidget(
    AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: MediaQuery(
          data: MediaQueryData(size: size),
          child: Scaffold(
            body: SummariesFeaturePage(store: store, autoload: autoload),
          ),
        ),
      ),
    ),
  );
}
