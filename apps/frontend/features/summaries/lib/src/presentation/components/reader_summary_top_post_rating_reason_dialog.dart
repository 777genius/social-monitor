part of 'reader_summary_brief_surface.dart';

Future<PostRatingReason?> _showPostRatingReasonDialog(
  BuildContext context,
  int rating,
) {
  return showDialog<PostRatingReason>(
    context: context,
    builder: (context) => _TopPostRatingReasonDialog(rating: rating),
  );
}

class _TopPostRatingReasonDialog extends StatelessWidget {
  const _TopPostRatingReasonDialog({required this.rating});

  final int rating;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return AlertDialog(
      key: const ValueKey('reader-summary-post-rating-reason-dialog'),
      title: Text('$rating-star reason'),
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 360),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Pick the main issue with this post.',
              style: textTheme.bodySmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                for (final reason in PostRatingReason.values)
                  ActionChip(
                    key: ValueKey(
                      'reader-summary-post-rating-reason-${reason.apiValue}',
                    ),
                    label: Text(reason.label),
                    onPressed: () => Navigator.of(context).pop(reason),
                  ),
              ],
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          key: const ValueKey('reader-summary-post-rating-reason-cancel'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
      ],
    );
  }
}
