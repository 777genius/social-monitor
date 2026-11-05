import { hasReadableFeedText } from './rss-readable-content';

describe('RSS and Atom visible text', () => {
  it.each([
    '<p title=">"> </p>',
    '<!-- hidden',
    '<script>hidden',
    '<style>p{color:red}',
    '<x:script>hidden</x:script>',
    '<x:style>p{color:red}</x:style>',
    '&ThickSpace;',
    '&NoBreak;',
    '\uFE0F',
    '\u034F',
  ])('does not count invisible HTML content %s', (value) => {
    expect(hasReadableFeedText(value)).toBe(false);
  });

  it.each(['&#128;', '&#x80;', 'A\uFE0F', '<p>A&NoBreak;</p>'])(
    'counts visible HTML content %s',
    (value) => {
      expect(hasReadableFeedText(value)).toBe(true);
    },
  );

  it('treats an Atom text construct as literal text', () => {
    expect(hasReadableFeedText('<script>', 'text')).toBe(true);
    expect(hasReadableFeedText('<script>', 'html')).toBe(false);
  });
});
