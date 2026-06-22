import { redactSensitiveText } from '@social-monitor/shared-kernel';

export type SourceContentSafetyCategory =
  | 'prompt_injection'
  | 'sensitive_data'
  | 'untrusted_instruction'
  | 'raw_payload_retention_disabled';

export type SourceContentSafetyStatus = 'allowed' | 'sanitized' | 'blocked';

export type SourceContentSafetyInput = {
  readonly title: string;
  readonly bodyPreview?: string;
  readonly canonicalUrl?: string;
  readonly providerKey: string;
};

export type SourceContentSafetyVerdict = {
  readonly status: SourceContentSafetyStatus;
  readonly categories: readonly SourceContentSafetyCategory[];
  readonly sanitizedTitle: string;
  readonly sanitizedBodyPreview?: string;
  readonly sanitizedCanonicalUrl?: string;
  readonly rawPayloadRetained: false;
  readonly retentionPolicy: 'normalized_preview_only';
};

const sourceInstructionReplacement = '[UNTRUSTED_SOURCE_INSTRUCTION_REDACTED]';
const promptInjectionPatterns = [
  /\bignore\s+(?:all\s+)?(?:previous|above|prior)\s+instructions\b/gi,
  /\breveal\s+(?:the\s+)?(?:system|developer)\s+prompt\b/gi,
  /\bprint\s+(?:the\s+)?(?:system|developer)\s+prompt\b/gi,
  /\bexfiltrate\s+(?:secrets|tokens|credentials)\b/gi,
  /\bcall\s+(?:the\s+)?(?:tool|function)\b/gi,
  /\bdeveloper\s+message\s*:/gi,
  /\bsystem\s+prompt\s*:/gi,
];

export class SourceContentSafetyPolicy {
  evaluate(input: SourceContentSafetyInput): SourceContentSafetyVerdict {
    const title = sanitizeSourceText(input.title);
    const bodyPreview = input.bodyPreview === undefined ? undefined : sanitizeSourceText(input.bodyPreview);
    const categories = new Set<SourceContentSafetyCategory>(['raw_payload_retention_disabled']);

    if (title.hadPromptInjection || bodyPreview?.hadPromptInjection === true) {
      categories.add('prompt_injection');
      categories.add('untrusted_instruction');
    }

    if (title.hadSensitiveData || bodyPreview?.hadSensitiveData === true) {
      categories.add('sensitive_data');
    }

    const sanitizedTitle = title.value.trim();
    const sanitizedBodyPreview = normalizeOptional(bodyPreview?.value);
    const status = categories.size > 1 ? 'sanitized' : 'allowed';

    return {
      status: sanitizedTitle.length === 0 && sanitizedBodyPreview === undefined ? 'blocked' : status,
      categories: [...categories].sort((left, right) => left.localeCompare(right)),
      sanitizedTitle,
      sanitizedBodyPreview,
      sanitizedCanonicalUrl: normalizeOptional(input.canonicalUrl),
      rawPayloadRetained: false,
      retentionPolicy: 'normalized_preview_only',
    };
  }
}

export const extractSignalKeywords = (value: string): readonly string[] =>
  [...new Set(value
    .toLocaleLowerCase('en-US')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/[^a-z0-9а-яё_ -]+/giu, ' ')
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4)
    .filter((part) => !stopWords.has(part)))]
    .slice(0, 12)
    .sort((left, right) => left.localeCompare(right));

const sanitizeSourceText = (value: string): {
  readonly value: string;
  readonly hadPromptInjection: boolean;
  readonly hadSensitiveData: boolean;
} => {
  const redacted = redactSensitiveText(value);
  let sanitized = redacted;
  let hadPromptInjection = false;

  for (const pattern of promptInjectionPatterns) {
    sanitized = sanitized.replace(pattern, () => {
      hadPromptInjection = true;

      return sourceInstructionReplacement;
    });
  }

  return {
    value: sanitized,
    hadPromptInjection,
    hadSensitiveData: redacted !== value,
  };
};

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};

const stopWords = new Set([
  'about',
  'after',
  'from',
  'into',
  'that',
  'this',
  'with',
  'your',
  'для',
  'как',
  'что',
  'это',
]);
