import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import 'reader_summary_next_actions.dart';
import 'reader_summary_provider_label.dart';

class ReaderSummaryEvidenceStrip extends StatelessWidget {
  const ReaderSummaryEvidenceStrip({
    super.key,
    required this.sourceMix,
    required this.topReads,
    required this.citationCount,
    required this.topReadCount,
    required this.intentForAction,
    required this.onAction,
  });

  final List<SourceMixEntry> sourceMix;
  final List<TopRead> topReads;
  final int citationCount;
  final int topReadCount;
  final UserActionIntent Function(ReaderAction action) intentForAction;
  final ReaderActionSelected onAction;

  @override
  Widget build(BuildContext context) {
    final isSingleSource = sourceMix.length == 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _sourceMixText(sourceMix),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            AppStatusBadge(
              label: '$topReadCount top reads',
              tone: AppStatusTone.neutral,
            ),
            AppStatusBadge(
              label: '$citationCount citations',
              tone: AppStatusTone.neutral,
            ),
            for (final entry in sourceMix.take(5))
              _SourceMixChip(
                entry: entry,
                action: _sourceActionFor(entry, topReads),
                intentForAction: intentForAction,
                onAction: onAction,
              ),
            if (isSingleSource)
              const AppStatusBadge(
                label: 'needs confirmation',
                tone: AppStatusTone.warning,
              ),
          ],
        ),
      ],
    );
  }
}

class _SourceMixChip extends StatelessWidget {
  const _SourceMixChip({
    required this.entry,
    required this.action,
    required this.intentForAction,
    required this.onAction,
  });

  final SourceMixEntry entry;
  final ReaderAction? action;
  final UserActionIntent Function(ReaderAction action) intentForAction;
  final ReaderActionSelected onAction;

  @override
  Widget build(BuildContext context) {
    final label =
        '${readerSummaryProviderLabel(entry.providerKey)} ${entry.itemCount}';
    final resolvedAction = action;
    if (resolvedAction == null) {
      return AppStatusBadge(label: label, tone: AppStatusTone.neutral);
    }
    final intent = intentForAction(resolvedAction);
    return Tooltip(
      message: intent.disabledReasonCode ?? resolvedAction.reason,
      child: ActionChip(
        key: ValueKey('reader-summary-source-chip-${entry.providerKey}'),
        avatar: const Icon(Icons.open_in_new_outlined, size: 16),
        label: Text(label, overflow: TextOverflow.ellipsis),
        onPressed: intent.isEnabled ? () => onAction(resolvedAction) : null,
      ),
    );
  }
}

ReaderAction? _sourceActionFor(SourceMixEntry entry, List<TopRead> topReads) {
  final topRead = _firstTopReadForSource(entry.providerKey, topReads);
  if (topRead == null) {
    return null;
  }

  return ReaderAction(
    kind: 'read_source',
    label: 'Open ${readerSummaryProviderLabel(entry.providerKey)} source',
    reason: 'Open the strongest cited source from this provider.',
    citationIds: topRead.citationIds,
    canonicalUrl: topRead.canonicalUrl,
  );
}

TopRead? _firstTopReadForSource(String providerKey, List<TopRead> topReads) {
  for (final item in topReads) {
    if (item.providerKey == providerKey &&
        item.canonicalUrl != null &&
        item.canonicalUrl!.trim().isNotEmpty) {
      return item;
    }
  }
  return null;
}

String _sourceMixText(List<SourceMixEntry> entries) {
  if (entries.isEmpty) {
    return 'No cited source mix is available yet.';
  }

  if (entries.length == 1) {
    return 'Only ${readerSummaryProviderLabel(entries.single.providerKey)} contributed cited evidence.';
  }

  final itemCount = entries.fold<int>(
    0,
    (count, entry) => count + entry.itemCount,
  );
  final labels = entries
      .take(3)
      .map((entry) => readerSummaryProviderLabel(entry.providerKey))
      .join(', ');
  final suffix = entries.length > 3 ? ' +${entries.length - 3} more' : '';

  return 'Sources: $labels$suffix. $itemCount cited items.';
}
