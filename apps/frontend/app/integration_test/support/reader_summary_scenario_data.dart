const topTitles = [
  'Anthropic publishes official watermark guidance',
  'Cursor agent update reaches HN',
  'GitHub 48 hour exact top',
  'Reddit exact top threshold',
  'SpaceX repository accelerates',
];

const additionalTitles = [
  'GitHub 24 hour exact additional',
  'HN exact additional threshold',
  'Reddit exact additional threshold',
  'X exact additional threshold',
  'GitHub 48 hour exact additional',
];

const cursorHnSupportUrl = 'https://news.ycombinator.com/item?id=cursor50';
const cursorOfficialSupportUrl = 'https://x.com/cursor/status/fixture';
const excludedRedditUrl =
    'https://reddit.com/r/fixture/comments/zero-nineteen/story';

const topUrls = [
  'https://x.com/anthropic/status/watermark',
  cursorHnSupportUrl,
  'https://github.com/fixture/top-48',
  'https://reddit.com/r/fixture/comments/top/story',
  'https://github.com/spacex/fixture',
];

const additionalUrls = [
  'https://github.com/fixture/additional-24',
  'https://news.ycombinator.com/item?id=hn25',
  'https://reddit.com/r/fixture/comments/additional/story',
  'https://x.com/fixture/status/x35',
  'https://github.com/fixture/additional-48',
];

const topAuthorizedUrlsByPost = <Set<String>>[
  {'https://x.com/anthropic/status/watermark'},
  {cursorHnSupportUrl, cursorOfficialSupportUrl},
  {'https://github.com/fixture/top-48'},
  {'https://reddit.com/r/fixture/comments/top/story'},
  {'https://github.com/spacex/fixture'},
];

const additionalAuthorizedUrlsByPost = <Set<String>>[
  {'https://github.com/fixture/additional-24'},
  {'https://news.ycombinator.com/item?id=hn25'},
  {'https://reddit.com/r/fixture/comments/additional/story'},
  {'https://x.com/fixture/status/x35'},
  {'https://github.com/fixture/additional-48'},
];

const rejectedTitles = [
  'Cursor official same-story note',
  'Duplicate Additional must lose to Top',
  'Eligible related topic must stay absent',
  'Reddit 7 score 5 comments absent',
  'Reddit 0 score 19 comments absent',
  'Negative controversy must stay absent',
  'X reply-only evidence absent',
  'Missing metrics absent',
  'Conflicting metrics absent',
  'X threshold minus one absent',
  'Reddit threshold minus one absent',
  'HN threshold minus one absent',
  'GitHub threshold minus one absent',
];
