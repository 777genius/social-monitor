part of 'reader_summary_brief_surface.dart';

class _TopPostsRevealTrigger extends StatefulWidget {
  const _TopPostsRevealTrigger({
    required this.generation,
    required this.remainingCount,
    required this.onReveal,
  });

  final int generation;
  final int remainingCount;
  final bool Function(int generation) onReveal;

  @override
  State<_TopPostsRevealTrigger> createState() => _TopPostsRevealTriggerState();
}

class _TopPostsRevealTriggerState extends State<_TopPostsRevealTrigger> {
  ScrollableState? _scrollable;
  ScrollPosition? _scrollPosition;
  bool _callbackScheduled = false;
  int? _revealedRemainingCount;
  int? _revealedGeneration;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final scrollable = Scrollable.maybeOf(context);
    final scrollPosition = scrollable?.position;
    if (!identical(scrollPosition, _scrollPosition)) {
      _detachScrollableListeners();
      _scrollable = scrollable;
      _scrollPosition = scrollPosition;
      _scrollPosition?.addListener(_handleScrollPositionChanged);
    } else {
      _scrollable = scrollable;
    }
    _scheduleRevealCheck();
  }

  @override
  void didUpdateWidget(covariant _TopPostsRevealTrigger oldWidget) {
    super.didUpdateWidget(oldWidget);
    _scheduleRevealCheck();
  }

  @override
  void dispose() {
    _detachScrollableListeners();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Center(
        child: Text(
          'More selected posts available',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            letterSpacing: 0,
          ),
        ),
      ),
    );
  }

  void _handleScrollPositionChanged() {
    _scheduleRevealCheck();
  }

  void _detachScrollableListeners() {
    _scrollPosition?.removeListener(_handleScrollPositionChanged);
  }

  void _scheduleRevealCheck() {
    if (widget.remainingCount <= 0 ||
        _callbackScheduled ||
        (_revealedGeneration == widget.generation &&
            _revealedRemainingCount == widget.remainingCount)) {
      return;
    }
    _callbackScheduled = true;
    final scheduledGeneration = widget.generation;
    final scheduledRemainingCount = widget.remainingCount;
    final onReveal = widget.onReveal;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _callbackScheduled = false;
      if (!mounted ||
          widget.generation != scheduledGeneration ||
          widget.remainingCount != scheduledRemainingCount ||
          !_isVisibleInScrollableViewport()) {
        return;
      }
      if (onReveal(scheduledGeneration)) {
        _revealedGeneration = scheduledGeneration;
        _revealedRemainingCount = scheduledRemainingCount;
      }
    });
  }

  bool _isVisibleInScrollableViewport() {
    final scrollable = _scrollable;
    if (scrollable == null) {
      return false;
    }
    final position = _scrollPosition;
    if (position == null || !position.hasPixels) {
      return false;
    }
    final triggerBox = context.findRenderObject();
    final viewportBox = scrollable.context.findRenderObject();
    if (triggerBox is! RenderBox ||
        viewportBox is! RenderBox ||
        !triggerBox.attached ||
        !viewportBox.attached ||
        !triggerBox.hasSize ||
        !viewportBox.hasSize) {
      return false;
    }
    final triggerRect = triggerBox.localToGlobal(Offset.zero) & triggerBox.size;
    final viewportRect =
        viewportBox.localToGlobal(Offset.zero) & viewportBox.size;
    return triggerRect.overlaps(viewportRect);
  }
}
