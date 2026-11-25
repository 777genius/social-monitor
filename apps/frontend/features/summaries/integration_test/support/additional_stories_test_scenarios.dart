const redditStoryTitle =
    'Does Claude Code leave watermarks inside generated code?';
const redditStoryUrl =
    'https://www.reddit.com/r/ClaudeAI/comments/fixture_watermark/claude_code_watermark_question/';

const rejectedAdditionalStoryTitles = [
  'Weak unrelated Reddit post',
  'Unknown relation kind must not render',
  'Malformed authority markers must not render',
  'Noncanonical relation value must not render',
  'Duplicate raw relation A must not render',
  'Duplicate raw relation B must not render',
  'Duplicate canonical relation A must not render',
  'Duplicate canonical relation B must not render',
  'Forged additional cluster must not render',
  'Forged curated card must not render',
  'Unmarked legacy top read must not render',
];

enum AdditionalStoriesNegativeCase {
  unknownKind,
  malformedMarkers,
  noncanonicalValue,
  duplicateRawId,
  duplicateCanonicalId,
  forgedCluster,
  forgedCurated,
  unmarkedTopRead,
  weakUnmarked,
}
