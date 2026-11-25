export const summarizeProviderLabels = (labels: readonly string[]): string => {
  const visible = labels.slice(0, 3);
  const hiddenCount = labels.length - visible.length;
  const visibleText = visible.join(", ");

  return hiddenCount === 0
    ? visibleText
    : `${visibleText} + ${hiddenCount} more`;
};
