final class FrontendTraceContext {
  const FrontendTraceContext({
    required this.correlationId,
    required this.screenId,
    this.actionId,
  });

  final String correlationId;
  final String screenId;
  final String? actionId;

  bool get isValid =>
      correlationId.trim().isNotEmpty && screenId.trim().isNotEmpty;

  FrontendTraceContext forAction(String nextActionId) {
    return FrontendTraceContext(
      correlationId: correlationId,
      screenId: screenId,
      actionId: nextActionId,
    );
  }
}

final class RedactedLogField {
  const RedactedLogField({required this.key, required this.value});

  final String key;
  final String value;

  factory RedactedLogField.present(String key) {
    return RedactedLogField(key: key, value: '[present]');
  }

  factory RedactedLogField.redacted(String key) {
    return RedactedLogField(key: key, value: '[redacted]');
  }

  factory RedactedLogField.safe(String key, String rawValue) {
    return RedactedLogField(key: key, value: redactValue(rawValue));
  }

  static String redactValue(String rawValue) {
    return rawValue
        .replaceAll(RegExp(r'Bearer\s+[A-Za-z0-9._~+/=-]+'), '[redacted]')
        .replaceAll(RegExp(r'sk-[A-Za-z0-9_-]+'), '[redacted]')
        .replaceAll(RegExp(r'client_secret\s*[:=]\s*\S+'), '[redacted]');
  }
}
