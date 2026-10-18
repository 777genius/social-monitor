import { buildScanStatusView } from './scan-status-view';

describe('collection completeness in scan status', () => {
  it.each([true, false])('preserves incomplete coverage even with zero items (backfill=%s)', (backfillPending) => {
    const executionMetadata = { collectionComplete: false, backfillPending, acceptedItemCount: 0 };
    expect(buildScanStatusView({ status: 'succeeded', executionMetadata })).toEqual({
      userState: 'scan_degraded', operatorAction: backfillPending ? 'wait_for_collection_backfill' : 'inspect_incomplete_source_content',
    });
  });
  it('keeps legacy success and complete collections current', () => {
    for (const executionMetadata of [undefined, { collectionComplete: true, backfillPending: false }]) {
      expect(buildScanStatusView({ status: 'succeeded', executionMetadata }).userState).toBe('content_current');
    }
  });
});
