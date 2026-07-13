part of 'reader_summary_brief_surface.dart';

const _topPostDescriptionMaxLines = 6;
const _topPostDescriptionNarrowMaxLines = 5;

class _TopPostContentColumn extends StatelessWidget {
  const _TopPostContentColumn({
    required this.item,
    required this.reservePreviewSpace,
  });

  final TopRead item;
  final bool reservePreviewSpace;

  @override
  Widget build(BuildContext context) {
    final media = item.previewMedia;
    final hasPreview = reservePreviewSpace && media != null;
    final body = _TopPostTextBody(item: item, floatPreview: hasPreview);
    return body;
  }
}

class _TopPostTextBody extends StatelessWidget {
  const _TopPostTextBody({required this.item, required this.floatPreview});

  final TopRead item;
  final bool floatPreview;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final tags = item.matchedRules
        .map(readablePostTag)
        .whereType<String>()
        .take(3)
        .toList(growable: false);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _shortTitle(item.title),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: textTheme.bodyMedium?.copyWith(
            fontWeight: isGitHubTrendingBreakout(item)
                ? FontWeight.w900
                : FontWeight.w700,
            letterSpacing: 0,
            height: 1.35,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        _TopPostReasonText(item: item, floatPreview: floatPreview),
        if (tags.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.xs + 2,
            runSpacing: AppSpacing.xs + 2,
            children: [for (final tag in tags) _TopPostTagPill(label: tag)],
          ),
        ],
      ],
    );
  }
}

class _TopPostReasonText extends StatelessWidget {
  const _TopPostReasonText({required this.item, required this.floatPreview});

  final TopRead item;
  final bool floatPreview;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final style = Theme.of(context).textTheme.bodySmall?.copyWith(
      color: colorScheme.onSurfaceVariant,
      letterSpacing: 0,
      height: 1.4,
    );
    final text = readerSummaryDisplayReason(item);
    final media = item.previewMedia;

    if (!floatPreview || media == null) {
      return Text(
        text,
        maxLines: _topPostDescriptionMaxLines,
        overflow: TextOverflow.ellipsis,
        style: style,
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final previewSize = constraints.maxWidth >= 720 ? 112.0 : 92.0;
        final gap = AppSpacing.md;
        final sideTextWidth = constraints.maxWidth - previewSize - gap;
        if (sideTextWidth < 180) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                text,
                maxLines: _topPostDescriptionMaxLines,
                overflow: TextOverflow.ellipsis,
                style: style,
              ),
              const SizedBox(height: AppSpacing.sm),
              _TopPostPreviewSlot(
                item: item,
                size: previewSize,
                reservePreviewSpace: false,
              ),
            ],
          );
        }

        final split = _splitFloatingPreviewText(
          context: context,
          text: text,
          style: style,
          width: sideTextWidth,
          maxLines: previewSize >= 112
              ? _topPostDescriptionMaxLines
              : _topPostDescriptionNarrowMaxLines,
        );

        return Column(
          key: const ValueKey('reader-summary-top-post-preview-wrap'),
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _TopPostPreviewSlot(
                  item: item,
                  size: previewSize,
                  reservePreviewSpace: false,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    split.leading,
                    maxLines: previewSize >= 112
                        ? _topPostDescriptionMaxLines
                        : _topPostDescriptionNarrowMaxLines,
                    overflow: TextOverflow.ellipsis,
                    style: style,
                  ),
                ),
              ],
            ),
            if (split.trailing.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                split.trailing,
                maxLines: _topPostDescriptionNarrowMaxLines,
                overflow: TextOverflow.ellipsis,
                style: style,
              ),
            ],
          ],
        );
      },
    );
  }
}

({String leading, String trailing}) _splitFloatingPreviewText({
  required BuildContext context,
  required String text,
  required TextStyle? style,
  required double width,
  required int maxLines,
}) {
  final normalized = text.trim();
  if (normalized.isEmpty) {
    return (leading: normalized, trailing: '');
  }

  final textDirection = Directionality.of(context);
  final textScaler = MediaQuery.textScalerOf(context);
  if (_floatingPreviewTextFits(
    text: normalized,
    style: style,
    textDirection: textDirection,
    textScaler: textScaler,
    width: width,
    maxLines: maxLines,
  )) {
    return (leading: normalized, trailing: '');
  }

  var low = 0;
  var high = normalized.length;
  while (low < high) {
    final mid = ((low + high + 1) / 2).floor();
    if (_floatingPreviewTextFits(
      text: normalized.substring(0, mid),
      style: style,
      textDirection: textDirection,
      textScaler: textScaler,
      width: width,
      maxLines: maxLines,
    )) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  final splitIndex = _floatingPreviewWordBoundary(normalized, low);
  return (
    leading: normalized.substring(0, splitIndex).trimRight(),
    trailing: normalized.substring(splitIndex).trimLeft(),
  );
}

bool _floatingPreviewTextFits({
  required String text,
  required TextStyle? style,
  required TextDirection textDirection,
  required TextScaler textScaler,
  required double width,
  required int maxLines,
}) {
  final painter = TextPainter(
    text: TextSpan(text: text, style: style),
    textDirection: textDirection,
    textScaler: textScaler,
    maxLines: maxLines,
  )..layout(maxWidth: width);

  return !painter.didExceedMaxLines;
}

int _floatingPreviewWordBoundary(String text, int index) {
  if (index >= text.length) {
    return text.length;
  }

  for (var cursor = index; cursor > 0; cursor -= 1) {
    if (text.codeUnitAt(cursor - 1) == 0x20) {
      return cursor - 1;
    }
  }

  return index.clamp(1, text.length).toInt();
}

class _TopPostTagPill extends StatelessWidget {
  const _TopPostTagPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest.withValues(alpha: 0.55),
        border: Border.all(color: colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm + 2,
          vertical: 3,
        ),
        child: Text(
          label,
          style: textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
      ),
    );
  }
}
