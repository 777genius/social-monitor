/// Exact safety-processed source snapshot. Availability describes the capture,
/// not a claim that the external publication was complete.
final class ReaderCapturedSource {
  const ReaderCapturedSource({
    required this.title,
    this.body,
    required this.captureAvailability,
    required this.reviewAvailability,
  });
  final String title;
  final String? body;
  final ReaderCaptureAvailability captureAvailability;
  final ReaderSourceReviewAvailability reviewAvailability;
}

enum ReaderCaptureAvailability { available, unavailable }
enum ReaderSourceReviewAvailability { bodyPresent, titleOnly, unavailable }

/// Only supplied after transport verification. Historical source presentations
/// have no display headline authority.
final class ReaderDisplayHeadline {
  const ReaderDisplayHeadline({required this.text, required this.kind});
  final String text;
  final ReaderDisplayHeadlineKind kind;
}
enum ReaderDisplayHeadlineKind { claim, subjectLabel }
