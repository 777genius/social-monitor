import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';

class ReaderSummaryInterestSections extends StatelessWidget {
  const ReaderSummaryInterestSections({super.key, required this.sections});

  final List<ReaderInterestSection> sections;

  @override
  Widget build(BuildContext context) {
    return ReaderSummarySection(
      title: 'By interest',
      icon: Icons.topic_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: sections
            .map((section) => _InterestSectionRow(section: section))
            .toList(growable: false),
      ),
    );
  }
}

class ReaderSummaryTrendDelta extends StatelessWidget {
  const ReaderSummaryTrendDelta({super.key, required this.delta});

  final ReaderTrendDelta delta;

  @override
  Widget build(BuildContext context) {
    return ReaderSummarySection(
      title: 'What changed',
      icon: Icons.trending_up_outlined,
      child: Wrap(
        spacing: AppSpacing.xs,
        runSpacing: AppSpacing.xs,
        children: [
          ..._trendBadges(delta.newSignals, 'New'),
          ..._trendBadges(delta.growingSignals, 'Growing'),
          ..._trendBadges(delta.repeatedSignals, 'Repeated'),
          ..._trendBadges(delta.fadingSignals, 'Fading'),
        ],
      ),
    );
  }

  List<Widget> _trendBadges(List<String> values, String label) {
    return values
        .take(2)
        .map(
          (value) => AppStatusBadge(
            label: '$label: $value',
            tone: AppStatusTone.neutral,
          ),
        )
        .toList(growable: false);
  }
}

class ReaderSummaryWatchouts extends StatelessWidget {
  const ReaderSummaryWatchouts({
    super.key,
    required this.questions,
    required this.risks,
  });

  final List<String> questions;
  final List<String> risks;

  @override
  Widget build(BuildContext context) {
    return ReaderSummarySection(
      title: 'Watchouts',
      icon: Icons.report_problem_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ...risks.take(2).map((risk) => Text('Risk: $risk')),
          ...questions.take(2).map((question) => Text('Question: $question')),
        ],
      ),
    );
  }
}

class ReaderSummarySection extends StatelessWidget {
  const ReaderSummarySection({
    super.key,
    required this.title,
    required this.icon,
    required this.child,
  });

  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: AppSpacing.md),
        Row(
          children: [
            Icon(icon, size: 18),
            const SizedBox(width: AppSpacing.xs),
            Text(
              title,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w900,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        child,
      ],
    );
  }
}

class _InterestSectionRow extends StatelessWidget {
  const _InterestSectionRow({required this.section});

  final ReaderInterestSection section;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            section.title,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
          ),
          Text(section.insight, maxLines: 3, overflow: TextOverflow.ellipsis),
          if (section.items.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: section.items
                  .take(3)
                  .map(
                    (item) => AppStatusBadge(
                      label: item.title,
                      tone: AppStatusTone.neutral,
                    ),
                  )
                  .toList(growable: false),
            ),
          ],
        ],
      ),
    );
  }
}
