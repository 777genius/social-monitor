import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_graph_view/flutter_graph_view.dart'
    as flutter_graph_view;
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:graphview/GraphView.dart' as graphview;
import 'package:markdown/markdown.dart' as markdown;
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/post_rating.dart';
import '../../domain/entities/summary_citation.dart';
import '../../domain/value_objects/reader_action_target.dart';
import '../../domain/value_objects/reader_summary_provider_family.dart';
import '../formatters/github_trending_watch_text.dart';
import '../formatters/reader_summary_claim_anchor_resolver.dart';
import '../formatters/summary_period_formats.dart';
import '../formatters/top_post_metrics.dart';
import '../formatters/top_post_source_label.dart';
import '../view_models/reader_summary_top_posts_projection.dart';
import 'reader_summary_citation_text.dart';
import 'reader_summary_confirmation.dart';
import 'reader_summary_next_actions.dart';
import 'reader_summary_preview_media.dart';
import 'reader_summary_provider_label.dart';
import 'reader_summary_provider_logo.dart';
import 'reader_summary_reason_text.dart';
import 'reader_summary_url_action_contract.dart';

part 'reader_summary_ai_brief.dart';
part 'reader_summary_citation_chip.dart';
part 'reader_summary_citation_source_projection.dart';
part 'reader_summary_claim_indicator.dart';
part 'reader_summary_executive_brief.dart';
part 'reader_summary_feedback_bar.dart';
part 'reader_summary_github_watch_appendix.dart';
part 'reader_summary_coverage_by_source_band.dart';
part 'reader_summary_coverage_diagnostics.dart';
part 'reader_summary_filtered_evidence.dart';
part 'reader_summary_evidence_read_card.dart';
part 'reader_summary_brief_helpers.dart';
part 'reader_summary_insight_rail.dart';
part 'reader_summary_metric_badges.dart';
part 'reader_summary_narrative.dart';
part 'reader_summary_provider_coverage_rows.dart';
part 'reader_summary_topic_map_edge_policy.dart';
part 'reader_summary_topic_map_flutter_graph_data.dart';
part 'reader_summary_topic_map_flutter_graph_shapes.dart';
part 'reader_summary_topic_map_graph.dart';
part 'reader_summary_topic_map_flutter_graph_view.dart';
part 'reader_summary_topic_map_collision_layout.dart';
part 'reader_summary_topic_map_graph_layout.dart';
part 'reader_summary_topic_map_graph_model.dart';
part 'reader_summary_topic_map_label_normalization.dart';
part 'reader_summary_topic_map_panel.dart';
part 'reader_summary_topic_map_policies.dart';
part 'reader_summary_topic_map_selection.dart';
part 'reader_summary_topic_map_visuals.dart';
part 'reader_summary_top_post_dense_row.dart';
part 'reader_summary_top_post_evidence_source_row.dart';
part 'reader_summary_top_post_content_column.dart';
part 'reader_summary_top_post_evidence_stack.dart';
part 'reader_summary_top_post_metrics_row.dart';
part 'reader_summary_top_post_preview_slot.dart';
part 'reader_summary_top_post_provider_tile.dart';
part 'reader_summary_top_post_rating_control.dart';
part 'reader_summary_top_post_rating_reason_dialog.dart';
part 'reader_summary_top_post_rating_slot.dart';
part 'reader_summary_top_post_row.dart';
part 'reader_summary_top_posts.dart';
part 'reader_summary_top_posts_reveal_trigger.dart';
part 'reader_summary_top_posts_sliver.dart';
part 'reader_summary_top_posts_controls.dart';
part 'reader_summary_top_posts_tabs.dart';

class ReaderSummaryBriefSurface extends StatefulWidget {
  const ReaderSummaryBriefSurface({
    super.key,
    required this.summary,
    required this.citationsById,
    required this.isRefreshing,
    required this.onOpenUrl,
  });

  final ReaderSummary summary;
  final Map<String, SummaryCitation> citationsById;
  final bool isRefreshing;
  final ValueChanged<String> onOpenUrl;

  @override
  State<ReaderSummaryBriefSurface> createState() =>
      _ReaderSummaryBriefSurfaceState();
}

class _ReaderSummaryBriefSurfaceState extends State<ReaderSummaryBriefSurface> {
  String? _selectedProviderKey;

  @override
  Widget build(BuildContext context) {
    final content = widget.summary.content;
    final selectedTopReads = _selectedProviderKey == null
        ? content.topReads
        : content.topReads
              .where((item) => item.providerKey == _selectedProviderKey)
              .toList(growable: false);
    final selectedCitations = _selectedProviderKey == null
        ? const <SummaryCitation>[]
        : widget.summary.citations
              .where(
                (citation) =>
                    _citationMatchesProvider(citation, _selectedProviderKey!),
              )
              .toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.isRefreshing) const _BriefToolbar(),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: SelectionArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _AiBriefCopy(
                  summary: widget.summary,
                  citationsById: widget.citationsById,
                  onOpenUrl: widget.onOpenUrl,
                ),
                if (!content.topicMap.isEmpty) ...[
                  const SizedBox(height: AppSpacing.md),
                  ReaderSummaryDeferredTopicMapPanel(
                    topicMap: content.topicMap,
                  ),
                ],
                const SizedBox(height: AppSpacing.md),
                _SourceFilterChips(
                  entries: content.sourceMix,
                  coverage: widget.summary.coverage,
                  selectedProviderKey: _selectedProviderKey,
                  topReadCount: content.topReads.length,
                  onSelected: (providerKey) {
                    setState(() => _selectedProviderKey = providerKey);
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                _FilteredEvidenceList(
                  selectedProviderKey: _selectedProviderKey,
                  topReads: selectedTopReads,
                  fallbackCitations: selectedCitations,
                  citationsById: widget.citationsById,
                  onOpenUrl: widget.onOpenUrl,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _BriefToolbar extends StatelessWidget {
  const _BriefToolbar();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.md,
        0,
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final badges = Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: const [
              AppStatusBadge(label: 'Refreshing', tone: AppStatusTone.success),
            ],
          );
          if (constraints.maxWidth < 420) {
            return badges;
          }
          return Align(
            alignment: AlignmentDirectional.centerEnd,
            child: badges,
          );
        },
      ),
    );
  }
}
