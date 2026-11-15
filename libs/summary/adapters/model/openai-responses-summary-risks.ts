import type { SummaryRisk } from "../../domain";
import {
  normalizeOptionalStringArray,
  optionalString,
  requiredArray,
  requiredRecord,
} from "./openai-responses-summary-json";
import { stringOrFallback } from "./openai-responses-summary-text";

// Provider risk admission is independent of confidence and presentation flags.
const riskReasons = new Set<NonNullable<SummaryRisk['reason']>>([
  'insufficient_evidence',
  'conflicting_evidence',
  'source_limit',
]);

export const normalizeRisks = (value: unknown): readonly SummaryRisk[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const values = requiredArray(value, 'risksAndUnknowns');

  return values.map((item, index) => {
    if (typeof item === 'string') {
      return {
        description: stringOrFallback(item, `Unspecified risk ${index + 1}`),
        citationIds: undefined,
        reason: undefined,
      };
    }

    const record = requiredRecord(item, `risksAndUnknowns[${index}]`);
    const reason = optionalString(record.reason);

    if (
      reason !== undefined &&
      !riskReasons.has(reason as NonNullable<SummaryRisk['reason']>)
    ) {
      throw new Error(
        `Invalid summary risk reason at risksAndUnknowns[${index}].reason`,
      );
    }
    const description = stringOrFallback(
      record.description ?? record.risk,
      `Unspecified risk ${index + 1}`,
    );

    return {
      description,
      citationIds:
        (record.citationIds ?? record.citations) === null
          ? undefined
          : normalizeOptionalStringArray(record.citationIds ?? record.citations),
      reason: reason as SummaryRisk['reason'],
    };
  });
};

