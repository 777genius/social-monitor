part of 'reader_summary_brief_surface.dart';

const _topPostOriginalMaxLines = 6;

String _topPostDisplayHeadline(TopRead item) {
  final headline = item.displayHeadline?.text.trim();
  return headline == null || headline.isEmpty ? item.title : headline;
}

String _topPostDisplaySummary(TopRead item) {
  final summary = item.summary?.trim();
  return summary == null || summary.isEmpty ? 'Summary unavailable.' : summary;
}

String _topPostOriginalText(TopRead item) {
  final source = item.capturedSource;
  if (source == null) return '';
  final title = source.title.trim();
  final body = source.body?.trim() ?? '';
  final provider = item.providerKey.trim().toLowerCase();
  final isX =
      provider == 'x' || provider == 'twitter' ||
      provider == 'x_twitter' || provider == 'x-twitter';
  if (isX) return body.isNotEmpty ? body : title;
  if (body.isEmpty) return title;
  if (title.isEmpty || body == title || body.startsWith(title)) return body;
  return '$title\n\n$body';
}

class _TopPostOriginalSwitch extends StatelessWidget {
  const _TopPostOriginalSwitch({required this.value, required this.onChanged});

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return MergeSemantics(
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('Original', style: Theme.of(context).textTheme.labelSmall),
          const SizedBox(width: AppSpacing.xs),
          SizedBox(
            width: 36,
            height: 28,
            child: FittedBox(
              fit: BoxFit.contain,
              child: Switch.adaptive(value: value, onChanged: onChanged),
            ),
          ),
        ],
      ),
    );
  }
}

class _TopPostOriginalBody extends StatelessWidget {
  const _TopPostOriginalBody({
    required this.item,
    required this.expanded,
    required this.showControl,
    required this.onOriginalChanged,
    required this.onExpandedChanged,
  });

  final TopRead item;
  final bool expanded;
  final bool showControl;
  final ValueChanged<bool> onOriginalChanged;
  final ValueChanged<bool> onExpandedChanged;

  @override
  Widget build(BuildContext context) {
    final text = _topPostOriginalText(item);
    final style = Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.4);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            if (showControl)
              _TopPostOriginalSwitch(value: true, onChanged: onOriginalChanged),
          ],
        ),
        if (text.isEmpty)
          Text('Original post unavailable.', style: style)
        else
          LayoutBuilder(
            builder: (context, constraints) {
              final painter = TextPainter(
                text: TextSpan(text: text, style: style),
                maxLines: _topPostOriginalMaxLines,
                textDirection: Directionality.of(context),
                textScaler: MediaQuery.textScalerOf(context),
              )..layout(maxWidth: constraints.maxWidth);
              final overflowed = painter.didExceedMaxLines;
              painter.dispose();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SelectableText(
                    text,
                    style: style,
                    maxLines: expanded ? null : _topPostOriginalMaxLines,
                  ),
                  if (overflowed || expanded)
                    AppButton(
                      label: expanded ? 'Show less' : 'Show more',
                      variant: AppButtonVariant.text,
                      onPressed: () => onExpandedChanged(!expanded),
                    ),
                ],
              );
            },
          ),
      ],
    );
  }
}


/// Source-only card body. Never substitutes generated headlines or prose.
class _TopPostSourceOnlyCopy extends StatelessWidget {
  const _TopPostSourceOnlyCopy({
    required this.item,
    required this.expanded,
    required this.onExpandedChanged,
  });

  final TopRead item;
  final bool expanded;
  final ValueChanged<bool> onExpandedChanged;

  @override
  Widget build(BuildContext context) {
    final provider = item.providerKey.trim().toLowerCase();
    final isX = provider == 'x' || provider == 'twitter' ||
        provider == 'x_twitter' || provider == 'x-twitter';
    final source = item.capturedSource;
    final title = (source?.title.trim().isNotEmpty ?? false)
        ? source!.title.trim()
        : item.title.trim();
    final body = source?.body?.trim() ?? '';
    // X has no separate title: show its original post text only.
    final heading = isX ? (body.isNotEmpty ? body : title) : title;
    final description = isX || body.isEmpty || body == title
        ? ''
        : body.startsWith(title) && title.isNotEmpty
            ? body.substring(title.length).trim()
            : body;
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final canExpand = heading.length > (isX ? 140 : 200) ||
        description.length > 180;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (heading.isNotEmpty)
          Text(
            heading,
            key: ValueKey('reader-source-original-${readerSummaryTopPostIdentity(item)}'),
            maxLines: expanded ? null : (isX ? 5 : 2),
            overflow: expanded ? TextOverflow.visible : TextOverflow.ellipsis,
            style: textTheme.bodyMedium?.copyWith(
              fontWeight: isX ? FontWeight.w500 : FontWeight.w700,
              height: 1.4,
            ),
          ),
        if (description.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            description,
            maxLines: expanded ? null : 4,
            overflow: expanded ? TextOverflow.visible : TextOverflow.ellipsis,
            style: textTheme.bodySmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
              height: 1.4,
            ),
          ),
        ],
        if (heading.isEmpty && description.isEmpty)
          Text('Original post text unavailable.',
              style: textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant)),
        if (canExpand)
          TextButton(
            onPressed: () => onExpandedChanged(!expanded),
            child: Text(expanded ? 'Show less' : 'Show more'),
          ),
      ],
    );
  }
}
