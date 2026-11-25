import type { SummaryKeyPoint, SummaryRisk } from '../../domain';

export const withKnownCitationIds = (
  keyPoints: readonly SummaryKeyPoint[],
  knownCitationIds: ReadonlySet<string>,
): readonly SummaryKeyPoint[] =>
  keyPoints
    .map((keyPoint) => ({
      ...keyPoint,
      citationIds: knownStringSubset(keyPoint.citationIds, knownCitationIds),
    }))
    .filter((keyPoint) => keyPoint.citationIds.length > 0);

export const withKnownRiskCitationIds = (
  risks: readonly SummaryRisk[],
  knownCitationIds: ReadonlySet<string>,
): readonly SummaryRisk[] =>
  risks.map((risk) => {
    if (risk.citationIds === undefined) {
      return risk;
    }

    const citationIds = knownStringSubset(risk.citationIds, knownCitationIds);

    return {
      ...risk,
      citationIds: citationIds.length === 0 ? undefined : citationIds,
    };
  });

const knownStringSubset = (
  values: readonly string[],
  knownValues: ReadonlySet<string>,
): readonly string[] => {
  const result: string[] = [];
  for (const value of values) {
    if (!knownValues.has(value) || result.includes(value)) {
      continue;
    }

    result.push(value);
  }

  return result;
};
