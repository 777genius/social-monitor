import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';

class ReaderSummaryPreviewMedia extends StatelessWidget {
  const ReaderSummaryPreviewMedia({
    super.key,
    required this.media,
    required this.compact,
    this.size,
    this.enableLightbox = false,
  });

  final PreviewMedia media;
  final bool compact;
  final double? size;
  final bool enableLightbox;

  @override
  Widget build(BuildContext context) {
    final resolvedSize = size ?? (compact ? 58.0 : 72.0);
    final colorScheme = Theme.of(context).colorScheme;
    final label =
        media.altText ??
        switch (media.kind) {
          PreviewMediaKind.video => 'Video preview',
          PreviewMediaKind.image => 'Image preview',
        };

    final preview = ClipRRect(
      borderRadius: BorderRadius.circular(8),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colorScheme.surfaceContainerHighest,
          border: Border.all(color: colorScheme.outlineVariant),
        ),
        child: SizedBox.square(
          dimension: resolvedSize,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.network(
                media.url,
                fit: BoxFit.cover,
                filterQuality: FilterQuality.low,
                webHtmlElementStrategy: WebHtmlElementStrategy.fallback,
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
    );

    return Semantics(
      image: true,
      button: enableLightbox,
      label: label,
      child: Tooltip(
        message: media.kind == PreviewMediaKind.video
            ? 'Video preview'
            : 'Image preview',
        child: enableLightbox
            ? GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => _openPreviewLightbox(context, media),
                child: preview,
              )
            : preview,
      ),
    );
  }
}

void _openPreviewLightbox(BuildContext context, PreviewMedia media) {
  showDialog<void>(
    context: context,
    builder: (context) => _PreviewLightbox(media: media),
  );
}

class _PreviewLightbox extends StatelessWidget {
  const _PreviewLightbox({required this.media});

  final PreviewMedia media;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Dialog.fullscreen(
      backgroundColor: colorScheme.scrim.withValues(alpha: 0.86),
      child: Stack(
        children: [
          Center(
            child: InteractiveViewer(
              minScale: 0.8,
              maxScale: 4,
              child: Image.network(
                media.url,
                fit: BoxFit.contain,
                filterQuality: FilterQuality.medium,
                webHtmlElementStrategy: WebHtmlElementStrategy.fallback,
                errorBuilder: (context, error, stackTrace) =>
                    _PreviewFallback(kind: media.kind),
              ),
            ),
          ),
          Positioned(
            top: AppSpacing.md,
            right: AppSpacing.md,
            child: IconButton.filledTonal(
              onPressed: () => Navigator.of(context).pop(),
              icon: const Icon(Icons.close_rounded),
              tooltip: 'Close preview',
            ),
          ),
          if (media.kind == PreviewMediaKind.video)
            const Center(child: _VideoBadge()),
        ],
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
