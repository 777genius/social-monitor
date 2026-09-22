import type { ReaderSummarySelectionStrategy } from "../../domain";
import type { ReaderSummarySelectionStrategyResolver } from
  "../../features/request-reader-summary/request-reader-summary.use-case";

type Scope = { readonly tenantId: string; readonly workspaceId: string;
  readonly interestId?: string };

export class ConfiguredReaderSummarySelectionStrategyResolver
implements ReaderSummarySelectionStrategyResolver {
  private readonly scopes: ReadonlySet<string>;

  constructor(
    private readonly strategy: ReaderSummarySelectionStrategy,
    scopes: readonly Scope[],
  ) {
    this.scopes = new Set(scopes.map(scopeKey));
    if (strategy !== "legacy_v2" && this.scopes.size === 0) {
      throw new Error("Jev summary strategy requires an explicit scope allowlist");
    }
  }

  resolve(params: Scope): ReaderSummarySelectionStrategy {
    return this.strategy === "legacy_v2" || params.interestId === undefined ||
      !this.scopes.has(scopeKey(params))
      ? "legacy_v2"
      : this.strategy;
  }
}

export const resolveReaderSummarySelectionStrategy = (
  env: NodeJS.ProcessEnv,
): ConfiguredReaderSummarySelectionStrategyResolver => {
  const strategy = env.READER_VALUE_MODE ?? "legacy_v2";
  if (strategy !== "legacy_v2" && strategy !== "jev_shadow" &&
      strategy !== "jev_primary_v3") {
    throw new Error("READER_VALUE_MODE must be legacy_v2, jev_shadow or jev_primary_v3");
  }
  if (strategy === "jev_primary_v3" &&
      (env.RELEVANCE_PERSISTENCE !== "prisma" ||
       env.SUMMARY_PERSISTENCE !== "prisma" ||
       env.READER_VALUE_SCORING_LOOP !== "enabled" ||
       env.INTELLIGENCE_READER_SUMMARY_JOB_LOOP !== "enabled")) {
    throw new Error("jev_primary_v3 requires durable relevance/summary persistence, assessment loop, and due poller");
  }
  return new ConfiguredReaderSummarySelectionStrategyResolver(
    strategy,
    parseScopes(env.READER_VALUE_DISCOVERY_SCOPES),
  );
};

const parseScopes = (raw: string | undefined): readonly Scope[] => {
  if (raw === undefined) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    throw new Error("READER_VALUE_DISCOVERY_SCOPES must be valid JSON");
  }
  if (!Array.isArray(value) || value.length > 1_000) {
    throw new Error("Reader value discovery scopes must be a bounded array");
  }
  return value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Reader value discovery scope is invalid");
    }
    const scope = entry as Record<string, unknown>;
    if (Object.keys(scope).length !== 3 || typeof scope.tenantId !== "string" ||
        typeof scope.workspaceId !== "string" || typeof scope.interestId !== "string" ||
        !uuid.test(scope.tenantId) || !uuid.test(scope.workspaceId) ||
        !uuid.test(scope.interestId)) {
      throw new Error("Reader value discovery scope is invalid");
    }
    return { tenantId: scope.tenantId.toLowerCase(),
      workspaceId: scope.workspaceId.toLowerCase(),
      interestId: scope.interestId.toLowerCase() };
  });
};

const scopeKey = (scope: Scope): string =>
  `${scope.tenantId.toLowerCase()}/${scope.workspaceId.toLowerCase()}/${
    scope.interestId?.toLowerCase() ?? "-"}`;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
