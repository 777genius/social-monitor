import { staticSummaryEvalFixtures } from './static-summary-eval.fixtures';

describe('staticSummaryEvalFixtures', () => {
  it('covers MVP blocking fixture groups with a single dataset version', () => {
    expect(staticSummaryEvalFixtures.map((fixture) => fixture.fixtureId)).toEqual([
      'empty-window-no-signal',
      'hn-citation-golden',
      'rss-prompt-injection-boundary',
      'rss-secret-redaction-boundary',
      'feedback-wrong-fact-grounding',
      'feedback-bad-citation-grounding',
      'stale-window-marker-regression',
    ]);
    expect(new Set(staticSummaryEvalFixtures.map((fixture) => fixture.datasetVersion))).toEqual(
      new Set(['summary.eval.mvp.v1']),
    );
    expect(new Set(staticSummaryEvalFixtures.map((fixture) => fixture.group))).toEqual(
      new Set([
        'empty_no_signal',
        'hn_golden',
        'prompt_injection',
        'secret_redaction',
        'citation_regression',
        'stale_marker',
      ]),
    );
  });
});
