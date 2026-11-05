const generatedXTitle = /^x post by @[^:]+:\s*/iu;
const minimumDuplicateTitleTokens = 4;

export const isReaderPromotionStoryTitleDuplicate = (
  leftTitle: string,
  rightTitle: string,
): boolean => {
  const left = normalizePromotionStoryTitle(leftTitle);
  const right = normalizePromotionStoryTitle(rightTitle);
  if (left.length === 0 || right.length === 0) return false;
  const [shorter, longer] = left.length <= right.length
    ? [left, right]
    : [right, left];
  if (tokenize(shorter).length < minimumDuplicateTitleTokens) return false;
  return longer === shorter || longer.startsWith(`${shorter} `);
};

export const normalizePromotionStoryTitle = (title: string): string =>
  title
    .replace(generatedXTitle, "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");

const tokenize = (value: string): readonly string[] =>
  value.split(" ").filter((token) => token.length >= 2);
