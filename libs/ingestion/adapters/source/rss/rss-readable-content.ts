/** Check the visible text of a feed field without changing the stored feed content. */
export const hasReadableFeedText = (value: string | undefined): boolean => {
  if (value === undefined) return false;

  const visible = value
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<\/?[a-z][^>]*>/giu, "")
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/giu, (entity, hex: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hex ?? decimal ?? "", hex === undefined ? 10 : 16);
      return Number.isInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    })
    .replace(/&(?:nbsp|ensp|emsp|thinsp|hairsp|numsp|puncsp|mediumspace|zerowidthspace|zwnj|zwj|lrm|rlm|tab|newline|shy);/giu, " ")
    .replace(/[\p{Cc}\p{Cf}\u034f]/gu, "")
    .trim();

  return visible.length > 0;
};
