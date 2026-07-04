part of 'reader_summary_brief_surface.dart';

class _TopPostRatingSlot extends StatelessWidget {
  const _TopPostRatingSlot({required this.visible, required this.child});

  final bool visible;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      key: const ValueKey('reader-summary-top-post-rating-slot'),
      opacity: visible ? 1 : 0,
      duration: const Duration(milliseconds: 120),
      curve: Curves.easeOut,
      child: IgnorePointer(
        ignoring: !visible,
        child: ExcludeFocus(
          excluding: !visible,
          child: ExcludeSemantics(excluding: !visible, child: child),
        ),
      ),
    );
  }
}
