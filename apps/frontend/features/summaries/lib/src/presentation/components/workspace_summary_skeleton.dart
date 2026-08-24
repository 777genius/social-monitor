import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

/// Pulsing placeholder mirroring the executive summary board layout while the
/// workspace summary loads.
class WorkspaceSummarySkeleton extends StatefulWidget {
  const WorkspaceSummarySkeleton({super.key});

  @override
  State<WorkspaceSummarySkeleton> createState() =>
      _WorkspaceSummarySkeletonState();
}

class _WorkspaceSummarySkeletonState extends State<WorkspaceSummarySkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
    lowerBound: 0.45,
    upperBound: 1,
  )..repeat(reverse: true);

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Loading summary',
      child: FadeTransition(
        opacity: _pulse,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: const [
            _SkeletonCard(child: _ExecutiveSkeletonBody()),
            SizedBox(height: AppSpacing.md + 2),
            _SkeletonCard(child: _TopPostsSkeletonBody()),
          ],
        ),
      ),
    );
  }
}

class _ExecutiveSkeletonBody extends StatelessWidget {
  const _ExecutiveSkeletonBody();

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 760;
        final copy = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            _SkeletonBlock(width: 220, height: 22),
            SizedBox(height: AppSpacing.md),
            _SkeletonBlock(height: 13),
            SizedBox(height: AppSpacing.sm),
            _SkeletonBlock(height: 13),
            SizedBox(height: AppSpacing.sm),
            _SkeletonBlock(height: 13, widthFactor: 0.9),
            SizedBox(height: AppSpacing.sm),
            _SkeletonBlock(height: 13, widthFactor: 0.7),
            SizedBox(height: AppSpacing.md),
            _SkeletonBlock(width: 300, height: 24, radius: 999),
          ],
        );
        final rail = Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: const [
            _SkeletonBlock(width: 90, height: 12),
            SizedBox(height: AppSpacing.sm + 4),
            _SkeletonBlock(width: 130, height: 26),
            SizedBox(height: AppSpacing.lg),
            _SkeletonBlock(width: 90, height: 12),
            SizedBox(height: AppSpacing.sm + 4),
            Row(
              children: [
                _SkeletonCircle(dimension: 96),
                SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    children: [
                      _SkeletonBlock(height: 11),
                      SizedBox(height: AppSpacing.sm),
                      _SkeletonBlock(height: 11),
                      SizedBox(height: AppSpacing.sm),
                      _SkeletonBlock(height: 11),
                    ],
                  ),
                ),
              ],
            ),
          ],
        );

        if (!wide) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              copy,
              const SizedBox(height: AppSpacing.lg),
              rail,
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: copy),
            const SizedBox(width: AppSpacing.xl),
            SizedBox(width: 300, child: rail),
          ],
        );
      },
    );
  }
}

class _TopPostsSkeletonBody extends StatelessWidget {
  const _TopPostsSkeletonBody();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _SkeletonBlock(width: 140, height: 18),
        const SizedBox(height: AppSpacing.md),
        for (var row = 0; row < 3; row += 1) ...[
          if (row > 0) const SizedBox(height: AppSpacing.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: const [
              _SkeletonBlock(width: 34, height: 34, radius: 8),
              SizedBox(width: AppSpacing.sm + 4),
              Expanded(
                child: Column(
                  children: [
                    _SkeletonBlock(height: 13),
                    SizedBox(height: AppSpacing.sm),
                    _SkeletonBlock(height: 11, widthFactor: 0.75),
                  ],
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Material(
      color: colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: child,
      ),
    );
  }
}

class _SkeletonBlock extends StatelessWidget {
  const _SkeletonBlock({
    this.width,
    this.widthFactor,
    required this.height,
    this.radius = 6,
  });

  final double? width;
  final double? widthFactor;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final block = DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(radius),
      ),
      child: SizedBox(width: width ?? double.infinity, height: height),
    );
    if (widthFactor == null) {
      return block;
    }
    return FractionallySizedBox(
      alignment: Alignment.centerLeft,
      widthFactor: widthFactor,
      child: block,
    );
  }
}

class _SkeletonCircle extends StatelessWidget {
  const _SkeletonCircle({required this.dimension});

  final double dimension;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        shape: BoxShape.circle,
      ),
      child: SizedBox.square(dimension: dimension),
    );
  }
}
