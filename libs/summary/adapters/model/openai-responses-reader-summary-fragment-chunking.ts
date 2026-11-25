const relevantFragmentLimit = 780;
export const sourceChunks = (source: string): readonly string[] => {
  const sentences = source
    .split(/(?<=[.!?])\s+/u)
    .flatMap((sentence) => splitLongText(sentence, relevantFragmentLimit));
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = `${current} ${sentence}`.trim();
    if (candidate.length <= relevantFragmentLimit) {
      current = candidate;
      continue;
    }
    if (current.length > 0) {
      chunks.push(current);
    }
    current = sentence;
  }
  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks.length > 0
    ? chunks
    : [compactText(source, relevantFragmentLimit)];
};

const splitLongText = (value: string, limit: number): readonly string[] => {
  const remaining: string[] = [];
  let cursor = value.trim();
  while (cursor.length > limit) {
    const prefix = cursor.slice(0, limit);
    const boundary = prefix.lastIndexOf(" ");
    const end = boundary >= Math.floor(limit * 0.6) ? boundary : limit;
    remaining.push(cursor.slice(0, end).trim());
    cursor = cursor.slice(end).trim();
  }
  if (cursor.length > 0) {
    remaining.push(cursor);
  }
  return remaining;
};

export const compactText = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maxLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};
