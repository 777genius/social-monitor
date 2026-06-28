import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_summary.dart';
import '../../domain/entities/summary_citation.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../../domain/value_objects/summary_generation_status.dart';
import '../stores/summaries_review_store.dart';
import 'github_mark.dart';
import 'reader_summary_external_link.dart';
import 'summary_generation_status_presenter.dart';

class SummaryDetailPanel extends StatelessWidget {
  const SummaryDetailPanel({
    super.key,
    required this.store,
    required this.summary,
  });

  final SummariesReviewStore store;
  final GeneratedSummary summary;

  @override
  Widget build(BuildContext context) {
    final detailState = store.detailState;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppEntityHeader(
          title: summary.title,
          subtitle: summary.bodyPreview,
          status: AppStatusBadge(
            label: summaryGenerationStatusLabel(summary.status),
            tone: summaryGenerationStatusTone(summary.status),
          ),
          metadata: [
            AppEntityMetadata(
              label: 'Citations',
              value: '${summary.citations.length}',
            ),
            AppEntityMetadata(
              label: 'Freshness',
              value: summary.freshnessLabel,
            ),
          ],
        ),
        if (summary.status == SummaryGenerationStatus.degraded) ...[
          const SizedBox(height: AppSpacing.md),
          const AppInlineProblem(
            title: 'Degraded summary',
            message: 'Some evidence is unavailable. Review citations first.',
            tone: AppProblemTone.warning,
          ),
        ],
        if (detailState is FailureViewState<GeneratedSummary>) ...[
          const SizedBox(height: AppSpacing.md),
          AppInlineProblem(
            title: 'Summary detail unavailable',
            message: detailState.failure.message,
            tone: AppProblemTone.warning,
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        const AppInlineProblem(
          title: 'Citation safety',
          message:
              'Summary details expose citation ids and safe snippets, not raw provider payload dumps.',
        ),
        const SizedBox(height: AppSpacing.md),
        AppDataList<SummaryCitation>(
          items: summary.citations,
          stableId: (citation) => citation.id,
          emptyTitle: 'No citations',
          emptyMessage: 'This summary does not expose supporting evidence yet.',
          itemBuilder: (context, citation, index) {
            return SummaryCitationTile(
              citation: citation,
              onOpenUrl: (url) => unawaited(
                store.openReaderSourceUrl(
                  summaryId: summary.id.value,
                  canonicalUrl: url,
                ),
              ),
            );
          },
        ),
        const SizedBox(height: AppSpacing.md),
        AppCommandBar(
          actions: [
            AppCommandAction(
              label: 'Regenerate',
              icon: Icons.refresh,
              variant: AppButtonVariant.secondary,
              onPressed: store.regenerationIntentFor(summary).isEnabled
                  ? () => unawaited(store.regenerate(summary))
                  : null,
            ),
            AppCommandAction(
              label: 'Helpful',
              icon: Icons.thumb_up_outlined,
              onPressed:
                  store
                      .feedbackIntentFor(summary, SummaryFeedbackKind.helpful)
                      .isEnabled
                  ? () => unawaited(
                      store.submitFeedback(
                        summary,
                        SummaryFeedbackKind.helpful,
                      ),
                    )
                  : null,
            ),
            AppCommandAction(
              label: 'Needs work',
              icon: Icons.rate_review_outlined,
              variant: AppButtonVariant.secondary,
              onPressed:
                  store
                      .feedbackIntentFor(summary, SummaryFeedbackKind.needsWork)
                      .isEnabled
                  ? () => unawaited(
                      store.submitFeedback(
                        summary,
                        SummaryFeedbackKind.needsWork,
                      ),
                    )
                  : null,
            ),
          ],
        ),
      ],
    );
  }
}

class SummaryCitationTile extends StatelessWidget {
  const SummaryCitationTile({
    super.key,
    required this.citation,
    required this.onOpenUrl,
  });

  final SummaryCitation citation;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final isGitHub = _isGitHubCitation(citation);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: dark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: isGitHub
                    ? const GitHubMark(size: 18)
                    : const Icon(Icons.link_outlined, size: 18),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      citation.sourceLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      citation.safeSnippet,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: dark
                            ? AppColors.darkTextMuted
                            : AppColors.textMuted,
                        letterSpacing: 0,
                      ),
                    ),
                    if (citation.canonicalUrl != null) ...[
                      const SizedBox(height: AppSpacing.xs),
                      ReaderSummaryExternalLink(
                        url: citation.canonicalUrl!,
                        onOpenUrl: onOpenUrl,
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

bool _isGitHubCitation(SummaryCitation citation) {
  final label = citation.sourceLabel.toLowerCase();
  final url = citation.canonicalUrl?.toLowerCase();
  return label.contains('github') ||
      label.contains('repo radar') ||
      url?.contains('github.com') == true;
}
