import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';

class ReaderSummaryPreviewMedia extends StatelessWidget {
  const ReaderSummaryPreviewMedia({
    super.key,
    required this.media,
    required this.compact,
  });

  final PreviewMedia media;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final size = compact ? 58.0 : 72.0;
    final colorScheme = Theme.of(context).colorScheme;
    final label =
        media.altText ??
        switch (media.kind) {
          PreviewMediaKind.video => 'Video preview',
          PreviewMediaKind.image => 'Image preview',
        };

    return Semantics(
      image: true,
      label: label,
      child: Tooltip(
        message: media.kind == PreviewMediaKind.video
            ? 'Video preview'
            : 'Image preview',
        child: ClipRRect(
          borderRadius: BorderRadius.circular(8),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: colorScheme.surfaceContainerHighest,
              border: Border.all(color: colorScheme.outlineVariant),
            ),
            child: SizedBox.square(
              dimension: size,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.network(
                    media.url,
                    fit: BoxFit.cover,
                    filterQuality: FilterQuality.low,
                    loadingBuilder: (context, child, loadingProgress) {
                      if (loadingProgress == null) {
                        return child;
                      }
                      return _PreviewFallback(kind: media.kind);
                    },
                    errorBuilder: (context, error, stackTrace) =>
                        _PreviewFallback(kind: media.kind),
                  ),
                  if (media.kind == PreviewMediaKind.video) const _VideoBadge(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _PreviewFallback extends StatelessWidget {
  const _PreviewFallback({required this.kind});

  final PreviewMediaKind kind;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Center(
      child: Icon(
        kind == PreviewMediaKind.video
            ? Icons.play_circle_outline
            : Icons.image_outlined,
        size: 24,
        color: colorScheme.onSurfaceVariant,
      ),
    );
  }
}

class _VideoBadge extends StatelessWidget {
  const _VideoBadge();

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Align(
      alignment: Alignment.center,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colorScheme.scrim.withValues(alpha: 0.58),
          borderRadius: BorderRadius.circular(999),
        ),
        child: const Padding(
          padding: EdgeInsets.all(AppSpacing.xs),
          child: Icon(Icons.play_arrow_rounded, color: Colors.white, size: 24),
        ),
      ),
    );
  }
}
