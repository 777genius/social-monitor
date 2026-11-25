const recoveryCopy =
  "COPY scripts/check-feed-promotion-index-recovery.ts ./scripts/";

export function finalStageCopiesFeedPromotionRecovery(dockerfile) {
  const activeLines = dockerfile
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  const finalFrom = activeLines.findLastIndex((line) =>
    /^FROM(?:\s|$)/iu.test(line)
  );
  return finalFrom >= 0 && activeLines.slice(finalFrom + 1).includes(recoveryCopy);
}
