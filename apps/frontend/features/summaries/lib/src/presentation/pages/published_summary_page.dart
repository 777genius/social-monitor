import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/summary_citation.dart';
import '../components/reader_summary_brief_surface.dart';
import '../components/reader_summary_header.dart';
import '../components/reader_summary_trust_panel.dart';
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
        final body = switch (widget.store.state) {
          InitialViewState<ReaderSummary>() ||
          LoadingViewState<ReaderSummary>(
            previousValue: null,
          ) => const Center(child: CircularProgressIndicator()),
          LoadingViewState<ReaderSummary>(:final previousValue?) =>
            _PublishedArticle(
              summary: previousValue,
              isRefreshing: true,
              onOpenUrl: (url) => unawaited(widget.store.openUrl(url)),
            ),
          ReadyViewState<ReaderSummary>(:final value) => _PublishedArticle(
            summary: value,
            isRefreshing: false,
            onOpenUrl: (url) => unawaited(widget.store.openUrl(url)),
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

class _PublishedArticle extends StatelessWidget {
  const _PublishedArticle({
    required this.summary,
    required this.isRefreshing,
    required this.onOpenUrl,
  });

  final ReaderSummary summary;
  final bool isRefreshing;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final citationsById = <String, SummaryCitation>{
      for (final citation in summary.citations) citation.id: citation,
    };
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 1040),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                AppStatusBadge(
                  label: 'Public daily briefing',
                  tone: AppStatusTone.success,
                ),
                const Spacer(),
                Text(
                  'Read-only',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            Card(
              clipBehavior: Clip.antiAlias,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    ReaderSummaryHeader(
                      title: summary.title,
                      isRefreshing: isRefreshing,
                      freshnessLabel: summary.freshnessLabel,
                      isDegraded: summary.isDegraded,
                      summaryWindow: summary.summaryWindow,
                    ),
                    const Divider(height: AppSpacing.xl),
                    ReaderSummaryBriefSurface(
                      summary: summary,
                      citationsById: citationsById,
                      isRefreshing: isRefreshing,
                      onOpenUrl: onOpenUrl,
                    ),
                    ReaderSummaryTrustPanel(
                      claims: summary.content.claimBoard,
                      reliabilityReport: summary.content.reliabilityReport,
                      citationsById: citationsById,
                      onOpenUrl: onOpenUrl,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
