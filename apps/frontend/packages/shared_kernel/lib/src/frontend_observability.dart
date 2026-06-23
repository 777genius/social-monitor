import 'frontend_trace_context.dart';

abstract final class FrontendEventCatalog {
  static const screenViewed = 'frontend.screen_viewed';
  static const actionInvoked = 'frontend.action_invoked';
  static const nonFatalError = 'frontend.non_fatal_error';
  static const unhandledError = 'frontend.unhandled_error';

  static const knownEventIds = {
    screenViewed,
    actionInvoked,
    nonFatalError,
    unhandledError,
  };

  static bool isKnown(String eventId) {
    return knownEventIds.contains(eventId);
  }
}

final class FrontendObservedEvent {
  const FrontendObservedEvent({
    required this.eventId,
    required this.trace,
    this.fields = const [],
  });

  final String eventId;
  final FrontendTraceContext trace;
  final List<RedactedLogField> fields;

  bool get isValid => trace.isValid && FrontendEventCatalog.isKnown(eventId);
}

abstract interface class FrontendObservability {
  void trackScreen(
    FrontendTraceContext trace, {
    List<RedactedLogField> fields = const [],
  });

  void trackAction(
    String actionId,
    FrontendTraceContext trace, {
    List<RedactedLogField> fields = const [],
  });

  void recordNonFatal(
    Object error,
    StackTrace stackTrace,
    FrontendTraceContext trace, {
    List<RedactedLogField> fields = const [],
  });
}

final class NoopFrontendObservability implements FrontendObservability {
  const NoopFrontendObservability();

  @override
  void trackScreen(
    FrontendTraceContext trace, {
    List<RedactedLogField> fields = const [],
  }) {}

  @override
  void trackAction(
    String actionId,
    FrontendTraceContext trace, {
    List<RedactedLogField> fields = const [],
  }) {}

  @override
  void recordNonFatal(
    Object error,
    StackTrace stackTrace,
    FrontendTraceContext trace, {
    List<RedactedLogField> fields = const [],
  }) {}
}
