import { parseRssFeedDocument } from './rss-feed-parser';

describe('RSS feed identity preservation', () => {
  it('keeps numeric-looking GUIDs with different leading zeros distinct', () => {
    const xml = '<rss><channel>' +
      '<item><guid>00123</guid><title>First</title></item>' +
      '<item><guid>123</guid><title>Second</title></item>' +
      '</channel></rss>';
    const result = parseRssFeedDocument(xml);
    expect(result.items.map((item) => item.guid)).toEqual(['00123', '123']);
    expect(result.rejectedEntries).toBe(0);
  });

  it('uses the first usable author in a repeated Atom author list', () => {
    const result = parseRssFeedDocument(
      '<feed><entry><id>atom-1</id>' +
      '<author><name/></author><author><name>Ada</name></author>' +
      '</entry></feed>',
    );
    expect(result.items[0]?.author).toBe('Ada');
  });
});
