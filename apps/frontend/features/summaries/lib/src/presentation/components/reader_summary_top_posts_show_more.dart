part of 'reader_summary_brief_surface.dart';

class _TopPostsShowMore extends StatelessWidget {
  const _TopPostsShowMore({
    required this.expanded,
    required this.remainingCount,
    required this.onPressed,
  });

  final bool expanded;
  final int remainingCount;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
    child: Center(
      child: Semantics(
        expanded: expanded,
        child: AppButton(
          key: const ValueKey('reader-summary-top-posts-show-more'),
          label: expanded ? 'Show less' : 'Show more ($remainingCount)',
          variant: AppButtonVariant.text,
          onPressed: onPressed,
        ),
      ),
    ),
  );
}
