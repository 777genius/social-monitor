import 'package:flutter/material.dart';

import '../../domain/aggregates/reader_summary.dart';
import 'github_mark.dart';
import 'reader_summary_preview_media.dart';

class ReaderSummaryTopReadLeading extends StatelessWidget {
  const ReaderSummaryTopReadLeading({
    super.key,
    required this.item,
    required this.compact,
    this.reservePreviewSpace = false,
  });

  final TopRead item;
  final bool compact;
  final bool reservePreviewSpace;

  @override
  Widget build(BuildContext context) {
    final previewMedia = item.previewMedia;
    if (previewMedia != null) {
      return ReaderSummaryPreviewMedia(media: previewMedia, compact: compact);
    }

    if (reservePreviewSpace) {
      final size = compact ? 58.0 : 72.0;
      final colorScheme = Theme.of(context).colorScheme;
      return SizedBox.square(
        dimension: size,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colorScheme.surfaceContainerHighest,
            border: Border.all(color: colorScheme.outlineVariant),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(child: _fallbackIcon(item)),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: _fallbackIcon(item),
    );
  }
}

Widget _fallbackIcon(TopRead item) {
  return _isGithub(item)
      ? const GitHubMark(size: 18)
      : const Icon(Icons.article_outlined, size: 18);
}

bool _isGithub(TopRead item) {
  final uri = Uri.tryParse(item.canonicalUrl ?? '');
  return item.providerKey == 'github-repo-radar' ||
      item.providerKey == 'github-trending-page' ||
      uri?.host.toLowerCase() == 'github.com';
}
