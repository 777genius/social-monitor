const topPostsContinuationBatchSize = 24;

final class TopPostsContinuationWindow {
  TopPostsContinuationWindow({required int initialVisibleCount})
    : _visibleItemLimit = _nonNegative(initialVisibleCount);

  int _visibleItemLimit;
  int _generation = 0;

  int get generation => _generation;

  int visibleItemCount(int totalItemCount) {
    final total = _nonNegative(totalItemCount);
    return _visibleItemLimit < total ? _visibleItemLimit : total;
  }

  void reset({required int initialVisibleCount}) {
    _generation += 1;
    _visibleItemLimit = _nonNegative(initialVisibleCount);
  }

  bool revealNext({required int generation, required int totalItemCount}) {
    if (generation != _generation) {
      return false;
    }
    final total = _nonNegative(totalItemCount);
    final nextLimit = _visibleItemLimit + topPostsContinuationBatchSize;
    final boundedLimit = nextLimit < total ? nextLimit : total;
    if (boundedLimit <= _visibleItemLimit) {
      return false;
    }
    _visibleItemLimit = boundedLimit;
    return true;
  }
}

int _nonNegative(int value) => value < 0 ? 0 : value;
