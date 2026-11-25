import 'app_failure.dart';

final class OperationGenerationGuard {
  int _generation = 0;

  int get generation => _generation;

  int markOperationStarted() {
    _generation += 1;
    return _generation;
  }

  void invalidate() {
    _generation += 1;
  }

  bool isCurrent(int operationGeneration) {
    return operationGeneration == _generation;
  }

  AppFailure? staleFailureFor(
    int operationGeneration, {
    String message = 'Operation completed after a newer request started',
    String code = 'stale_operation',
  }) {
    if (isCurrent(operationGeneration)) {
      return null;
    }
    return StaleOperationFailure(message: message, code: code);
  }
}
