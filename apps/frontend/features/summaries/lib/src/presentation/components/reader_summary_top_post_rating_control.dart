part of 'reader_summary_brief_surface.dart';

const _topPostRatingActiveColor = Color(0xFFF59E0B);

class _TopPostRatingControl extends StatefulWidget {
  const _TopPostRatingControl({
    required this.dense,
    required this.rating,
    required this.onRated,
  });

  final bool dense;
  final int? rating;
  final Future<bool> Function(int rating, PostRatingReason? reason) onRated;

  @override
  State<_TopPostRatingControl> createState() => _TopPostRatingControlState();
}

class _TopPostRatingControlState extends State<_TopPostRatingControl> {
  int? _selectedRating;
  int? _hoverRating;
  bool _saving = false;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    _selectedRating = widget.rating;
  }

  @override
  void didUpdateWidget(covariant _TopPostRatingControl oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.rating != oldWidget.rating && widget.rating != _selectedRating) {
      _selectedRating = widget.rating;
      _saved = widget.rating != null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final activeRating = _hoverRating ?? _selectedRating ?? 0;
    final iconSize = widget.dense ? 17.0 : 19.0;

    return Semantics(
      label: 'Rate this post',
      value: _selectedRating == null ? 'Not rated' : '${_selectedRating!} of 5',
      child: Wrap(
        spacing: 1,
        runSpacing: AppSpacing.xs,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          for (var rating = 1; rating <= 5; rating += 1)
            MouseRegion(
              onEnter: (_) => setState(() => _hoverRating = rating),
              onExit: (_) => setState(() => _hoverRating = null),
              child: IconButton(
                key: ValueKey('reader-summary-top-post-rating-$rating'),
                tooltip: 'Rate $rating of 5',
                visualDensity: VisualDensity.compact,
                padding: EdgeInsets.zero,
                constraints: BoxConstraints.tightFor(
                  width: widget.dense ? 24 : 26,
                  height: widget.dense ? 24 : 26,
                ),
                iconSize: iconSize,
                color: rating <= activeRating
                    ? _topPostRatingActiveColor
                    : colorScheme.onSurfaceVariant,
                onPressed: _saving ? null : () => _submitRating(rating),
                icon: Icon(
                  rating <= activeRating
                      ? Icons.star_rounded
                      : Icons.star_border_rounded,
                ),
              ),
            ),
          if (_saving)
            SizedBox.square(
              dimension: widget.dense ? 14 : 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: colorScheme.primary,
              ),
            )
          else if (_saved)
            Text(
              'Saved',
              style: textTheme.labelSmall?.copyWith(
                color: AppColors.success,
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _submitRating(int rating) async {
    final reason = postRatingRequiresReason(rating)
        ? await _showPostRatingReasonDialog(context, rating)
        : null;
    if (!mounted) {
      return;
    }
    if (postRatingRequiresReason(rating) && reason == null) {
      return;
    }
    final previousRating = _selectedRating;
    setState(() {
      _saving = true;
      _saved = false;
    });
    try {
      final submitted = await widget.onRated(rating, reason);
      if (!mounted) {
        return;
      }
      setState(() {
        _selectedRating = submitted ? rating : previousRating;
        _saving = false;
        _saved = submitted;
      });
    } catch (_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _selectedRating = previousRating;
        _saving = false;
        _saved = false;
      });
    }
  }
}
