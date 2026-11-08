import type { SummaryModelInput } from '../../ports';

export const buildExecutiveSummary = (input: SummaryModelInput): string => {
  const formatLabel = input.policy.format.replace('_', ' ');
  const toneLabel = input.policy.tone;
  const languageLabel =
    input.policy.language === 'auto'
      ? 'source language'
      : input.policy.language;
  const base = `Current ${formatLabel} uses ${input.evidence.items.length} selected item(s), ${toneLabel} tone, ${languageLabel}.`;

  if (input.policy.customInstructions === undefined) {
    return appendMemoryContext(base, input);
  }

  return appendMemoryContext(
    `${base} Custom focus: ${input.policy.customInstructions}`,
    input,
  );
};

export const buildNoSignalSummary = (input: SummaryModelInput): string => {
  const base =
    'No eligible evidence items were available for this interest window.';

  if (input.policy.customInstructions === undefined) {
    return appendMemoryContext(base, input);
  }

  return appendMemoryContext(
    `${base} Custom focus: ${input.policy.customInstructions}`,
    input,
  );
};

const appendMemoryContext = (
  base: string,
  input: SummaryModelInput,
): string => {
  const memory = input.memoryContext;
  if (
    memory?.status !== 'available' ||
    memory.renderedText === undefined ||
    memory.renderedText.trim().length === 0
  ) {
    return base;
  }

  return `${base} Memory context: ${memory.renderedText.trim().slice(0, 500)}`;
};
