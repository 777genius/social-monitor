part of 'reader_summary_brief_surface.dart';

class _ClaimTrustIndicator extends StatefulWidget {
  const _ClaimTrustIndicator({required this.claim});

  final SummaryClaim claim;

  @override
  State<_ClaimTrustIndicator> createState() => _ClaimTrustIndicatorState();
}

class _ClaimTrustIndicatorState extends State<_ClaimTrustIndicator> {
  final MenuController _controller = MenuController();
  Timer? _closeTimer;
  bool _open = false;

  @override
  void dispose() {
    _closeTimer?.cancel();
    super.dispose();
  }

  void _show() {
    _closeTimer?.cancel();
    if (!_open) {
      setState(() => _open = true);
    }
    if (!_controller.isOpen) {
      _controller.open();
    }
  }

  void _toggle() {
    if (_controller.isOpen) {
      _hide();
    } else {
      _show();
    }
  }

  void _hide() {
    _closeTimer?.cancel();
    if (mounted && _open) {
      setState(() => _open = false);
    }
    if (_controller.isOpen) {
      _controller.close();
    }
  }

  void _scheduleHide() {
    _closeTimer?.cancel();
    _closeTimer = Timer(const Duration(milliseconds: 280), _hide);
  }

  @override
  Widget build(BuildContext context) {
    final visual = _claimVisual(widget.claim);
    return MenuAnchor(
      controller: _controller,
      alignmentOffset: const Offset(0, 6),
      menuChildren: _open
          ? [
              MouseRegion(
                onEnter: (_) => _show(),
                onExit: (_) => _scheduleHide(),
                child: Material(
                  type: MaterialType.transparency,
                  child: _ClaimTrustPreview(claim: widget.claim),
                ),
              ),
            ]
          : const [],
      child: Semantics(
        button: true,
        label: _claimSemanticsLabel(widget.claim),
        child: MouseRegion(
          onEnter: (_) => _show(),
          onExit: (_) => _scheduleHide(),
          cursor: SystemMouseCursors.click,
          child: InkWell(
            key: ValueKey(
              'reader-summary-claim-indicator-${widget.claim.id ?? widget.claim.citationIds.join('-')}',
            ),
            onTap: _toggle,
            borderRadius: BorderRadius.circular(6),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: visual.color.withValues(alpha: 0.1),
                border: Border.all(color: visual.color.withValues(alpha: 0.35)),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                child: Icon(
                  visual.icon,
                  key: ValueKey(
                    'reader-summary-claim-confidence-${widget.claim.confidence.level}',
                  ),
                  size: 13,
                  color: visual.color,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  _ClaimTrustVisual _claimVisual(SummaryClaim claim) {
    final colors = Theme.of(context).colorScheme;
    return switch (claim.confidence.level) {
      'high' => _ClaimTrustVisual(
        icon: Icons.verified_user_outlined,
        color: AppColors.success,
      ),
      'medium' => _ClaimTrustVisual(
        icon: Icons.shield_outlined,
        color: colors.primary,
      ),
      _ => _ClaimTrustVisual(
        icon: Icons.gpp_maybe_outlined,
        color: colors.error,
      ),
    };
  }
}

final class _ClaimTrustVisual {
  const _ClaimTrustVisual({required this.icon, required this.color});

  final IconData icon;
  final Color color;
}

class _ClaimTrustPreview extends StatelessWidget {
  const _ClaimTrustPreview({required this.claim});

  final SummaryClaim claim;

  @override
  Widget build(BuildContext context) {
    final score = (claim.confidence.score.clamp(0, 1) * 100).round();
    final sourceCount = claim.evidence
        .map((item) => item.providerKey.trim().toLowerCase())
        .where((item) => item.isNotEmpty)
        .toSet()
        .length;
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 300, maxWidth: 420),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              claim.claim,
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              '${_confidenceLabel(claim.confidence.level)} confidence, $score% - $sourceCount source group${sourceCount == 1 ? '' : 's'}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 2),
            Text(
              claim.confidence.rationale,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
            ),
            if (claim.risks.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                claim.risks.first.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _confidenceLabel(String value) => switch (value) {
    'high' => 'High',
    'medium' => 'Medium',
    _ => 'Low',
  };
}

String _claimSemanticsLabel(SummaryClaim claim) =>
    '${claim.confidence.level} confidence claim details';
