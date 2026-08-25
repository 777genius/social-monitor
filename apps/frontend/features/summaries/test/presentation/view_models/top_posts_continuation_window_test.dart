import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/top_posts_continuation_window.dart';

void main() {
  test('reveals bounded batches and rejects a stale reset generation', () {
    final window = TopPostsContinuationWindow(initialVisibleCount: 8);
    final staleGeneration = window.generation;

    expect(window.visibleItemCount(80), 8);
    expect(
      window.revealNext(generation: staleGeneration, totalItemCount: 80),
      isTrue,
    );
    expect(window.visibleItemCount(80), 32);

    window.reset(initialVisibleCount: 8);

    expect(
      window.revealNext(generation: staleGeneration, totalItemCount: 80),
      isFalse,
    );
    expect(window.visibleItemCount(80), 8);
    expect(
      window.revealNext(generation: window.generation, totalItemCount: 80),
      isTrue,
    );
    expect(window.visibleItemCount(80), 32);
    expect(
      window.revealNext(generation: window.generation, totalItemCount: 80),
      isTrue,
    );
    expect(window.visibleItemCount(80), 56);
  });
}
