part of 'reader_summary_brief_surface.dart';

class _TopPostPreviewSlot extends StatelessWidget {
  const _TopPostPreviewSlot({
    required this.item,
    required this.size,
    required this.reservePreviewSpace,
  });

  final TopRead item;
  final double size;
  final bool reservePreviewSpace;

  @override
  Widget build(BuildContext context) {
    final media = item.previewMedia;
    if (media != null) {
      return ReaderSummaryPreviewMedia(
        media: media,
        compact: false,
        size: size,
        enableLightbox: true,
      );
    }

    if (!reservePreviewSpace) {
      return const SizedBox.shrink();
    }

    return SizedBox(width: size, height: size);
  }
}
