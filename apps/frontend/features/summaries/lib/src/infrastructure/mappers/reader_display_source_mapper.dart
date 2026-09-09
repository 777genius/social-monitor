import '../../domain/value_objects/reader_captured_source.dart';

ReaderCapturedSource? mapReaderCapturedSource(Object? value) {
  if (value is! Map<String, Object?> || value['title'] is! String) return null;
  final body = value['body'];
  if (body != null && body is! String) return null;
  final capture = switch (value['captureAvailability']) {
    'available' => ReaderCaptureAvailability.available,
    'unavailable' => ReaderCaptureAvailability.unavailable,
    _ => null,
  };
  final review = switch (value['reviewAvailability']) {
    'body_present' => ReaderSourceReviewAvailability.bodyPresent,
    'title_only' => ReaderSourceReviewAvailability.titleOnly,
    'unavailable' => ReaderSourceReviewAvailability.unavailable,
    _ => null,
  };
  if (capture == null || review == null) return null;
  return ReaderCapturedSource(title: value['title']! as String,
    body: body as String?, captureAvailability: capture, reviewAvailability: review);
}

ReaderDisplayHeadline? mapReaderDisplayHeadline(Object? value) {
  if (value is! Map<String, Object?> || value['status'] != 'accepted' ||
      value['text'] is! String) return null;
  final kind = switch (value['kind']) {
    'claim' => ReaderDisplayHeadlineKind.claim,
    'subject_label' => ReaderDisplayHeadlineKind.subjectLabel,
    _ => null,
  };
  return kind == null ? null : ReaderDisplayHeadline(text: value['text']! as String, kind: kind);
}
