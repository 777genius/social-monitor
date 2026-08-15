import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../components/reader_summary_top_posts_section_sliver.dart';
import '../components/reader_summary_view.dart';
import '../components/workspace_summary_period_shell.dart';
import '../stores/published_summary_store.dart';

class PublishedSummaryPage extends StatefulWidget {
  const PublishedSummaryPage({super.key, required this.store});

  final PublishedSummaryStore store;

  @override
  State<PublishedSummaryPage> createState() => _PublishedSummaryPageState();
}

class _PublishedSummaryPageState extends State<PublishedSummaryPage> {
  @override
  void initState() {
    super.initState();
    unawaited(widget.store.load());
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.store,
      builder: (context, _) {
        final state = widget.store.state;
        final summary = switch (state) {
          ReadyViewState<ReaderSummary>(:final value) => value,
          LoadingViewState<ReaderSummary>(:final previousValue) =>
            previousValue,
          _ => null,
        };
        if (summary != null) {
          return _PublishedSummaryArticle(
            store: widget.store,
            summary: summary,
            isRefreshing: state is LoadingViewState<ReaderSummary>,
            onOpenUrl: (url) => unawaited(widget.store.openUrl(url)),
          );
        }

        final body = switch (state) {
          ReadyViewState<ReaderSummary>() => const SizedBox.shrink(),
          InitialViewState<ReaderSummary>() ||
          LoadingViewState<ReaderSummary>() => const Center(
            child: CircularProgressIndicator(),
          ),
          EmptyViewState<ReaderSummary>(:final reason) => AppEmptyState(
            title: 'The next story is being prepared',
            message: reason,
            icon: Icons.auto_stories_outlined,
          ),
          FailureViewState<ReaderSummary>(:final failure) => AppInlineProblem(
            title: 'Summary unavailable',
            message: failure.message,
            tone: AppProblemTone.warning,
            actionLabel: 'Retry',
            onAction: () => unawaited(widget.store.load()),
          ),
          PermissionRequiredViewState<ReaderSummary>(:final message) =>
            AppInlineProblem(title: 'Access unavailable', message: message),
          RetryingViewState<ReaderSummary>() => const Center(
            child: CircularProgressIndicator(),
          ),
        };

        return CustomScrollView(
          key: const PageStorageKey<String>('published-summary-scroll-view'),
          slivers: [
            SliverPadding(
              padding: appPageSurfaceInsets(context),
              sliver: SliverToBoxAdapter(child: body),
            ),
          ],
        );
      },
    );
  }
}

class _PublishedSummaryArticle extends StatelessWidget {
  const _PublishedSummaryArticle({
    required this.store,
    required this.summary,
    required this.isRefreshing,
    required this.onOpenUrl,
  });

  final PublishedSummaryStore store;
  final ReaderSummary summary;
  final bool isRefreshing;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final pageInsets = appPageSurfaceInsets(context);
    final articlePadding = EdgeInsets.fromLTRB(
      pageInsets.left,
      AppSpacing.md,
      pageInsets.right,
      0,
    );
    final topPostsPadding = EdgeInsets.fromLTRB(
      pageInsets.left,
      0,
      pageInsets.right,
      pageInsets.bottom,
    );
    return CustomScrollView(
      key: const PageStorageKey<String>('published-summary-scroll-view'),
      slivers: [
        SliverToBoxAdapter(
          child: WorkspaceSummaryPeriodShell(
            selectedPeriod: store.selectedPeriod,
            selectedPreset: store.selectedPeriodPreset,
            availableSummaryPeriods: store.availablePeriods,
            canNavigateToPreviousPeriod: store.canNavigateToPreviousPeriod,
            canNavigateToNextPeriod: store.canNavigateToNextPeriod,
            onPeriodChanged: (preset) =>
                unawaited(store.selectPeriodPreset(preset)),
            onPreviousPeriod: () => unawaited(store.showPreviousPeriod()),
            onNextPeriod: () => unawaited(store.showNextPeriod()),
            onCalendarDateSelected: (date) =>
                unawaited(store.selectCalendarDate(date)),
            isGenerating: false,
            exportSummary: summary,
            showRefreshSchedule: store.isViewingLatestDailySummary,
            onRefreshDue: () => unawaited(store.load()),
            contentPadding: articlePadding,
            child: ReaderSummaryView.readOnly(
              key: const ValueKey('published-reader-summary-view'),
              summary: summary,
              isRefreshing: isRefreshing,
              onOpenUrl: onOpenUrl,
              includeTopPosts: false,
            ),
          ),
        ),
        ReaderSummaryTopPostsSectionSliver(
          summary: summary,
          contentPadding: topPostsPadding,
          onOpenUrl: onOpenUrl,
        ),
      ],
    );
  }
}
