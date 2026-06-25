import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/generated_briefing.dart';
import 'reader_briefing_provider_label.dart';

class ReaderBriefingTopReadPreview extends StatelessWidget {
  const ReaderBriefingTopReadPreview({super.key, required this.items});

  final List<BriefingReaderItem> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Top 3 reads',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w900,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            for (final entry in items.indexed)
              _TopReadPreviewItem(index: entry.$1, item: entry.$2),
          ],
        ),
      ],
    );
  }
}

class _TopReadPreviewItem extends StatelessWidget {
  const _TopReadPreviewItem({required this.index, required this.item});

  final int index;
  final BriefingReaderItem item;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return ConstrainedBox(
      key: ValueKey('reader-brief-top-read-preview-$index'),
      constraints: const BoxConstraints(minWidth: 220, maxWidth: 360),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerHighest,
          border: Border.all(color: colorScheme.outlineVariant),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${index + 1}. ${item.title}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: [
                  AppStatusBadge(
                    label: readerBriefingProviderLabel(item.providerKey),
                    tone: AppStatusTone.neutral,
                  ),
                  if (item.citationIds.isNotEmpty)
                    AppStatusBadge(
                      label: '${item.citationIds.length} citation',
                      tone: AppStatusTone.neutral,
                    ),
                ],
              ),
              if (item.canonicalUrl != null) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  _compactCanonicalUrl(item.canonicalUrl!),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: colorScheme.primary,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

String _compactCanonicalUrl(String value) {
  final uri = Uri.tryParse(value);
  final host = uri?.host;
  final path = uri?.path;
  if (host == null || host.isEmpty) {
    return value;
  }

  if (path == null || path.isEmpty || path == '/') {
    return host;
  }

  return '$host$path';
}
