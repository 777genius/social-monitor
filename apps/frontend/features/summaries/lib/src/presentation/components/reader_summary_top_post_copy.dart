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
      provider == 'x' || provider == 'twitter' || provider == 'x_twitter';
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
