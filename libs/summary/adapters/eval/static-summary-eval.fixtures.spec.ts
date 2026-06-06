import { staticSummaryEvalFixtures } from './static-summary-eval.fixtures';

describe('staticSummaryEvalFixtures', () => {
  it('covers MVP blocking fixture groups with a single dataset version', () => {
    expect(staticSummaryEvalFixtures.map((fixture) => fixture.fixtureId)).toEqual([
      'empty-window-no-signal',
      'hn-citation-golden',
      'rss-prompt-injection-boundary',
    ]);
    expect(new Set(staticSummaryEvalFixtures.map((fixture) => fixture.datasetVersion))).toEqual(
      new Set(['summary.eval.mvp.v1']),
    );
  });
});
