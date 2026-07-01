final class PreviewMedia {
  const PreviewMedia({
    required this.kind,
    required this.url,
    this.sourceUrl,
    this.altText,
  });

  final PreviewMediaKind kind;
  final String url;
  final String? sourceUrl;
  final String? altText;
}

enum PreviewMediaKind { image, video }
