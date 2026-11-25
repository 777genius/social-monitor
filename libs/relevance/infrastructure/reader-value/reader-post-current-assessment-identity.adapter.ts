import type { ReaderPostAssessmentIdentityBuilder, ReaderPostAssessmentSource } from
  "@social-monitor/summary/application/contracts/reader-post-assessment-identity";
import type { ReaderValueInputBuilder } from "../../application/contracts/reader-value-inventory";
import { classifyReaderValueSourceKind } from "../../domain/reader-value/reader-value-source-kind";
import { readReaderValueCapture } from "./reader-value-capture";
import { readReaderValueQuotedContext } from "./reader-value-quoted-context";
import type { ReaderValueScoringProvider } from "./reader-value-provider-config";
import { readerValueRequestMatches } from "./reader-value-request-guard";
import { READER_VALUE_INVENTORY_MAX_SOURCE_BYTES } from "./prisma-reader-value-inventory";

/** Reuses normal current input authority without reading another snapshot or calling a model. */
export class ReaderPostCurrentAssessmentIdentityAdapter implements ReaderPostAssessmentIdentityBuilder {
  readonly maxSourceBytes = READER_VALUE_INVENTORY_MAX_SOURCE_BYTES;
  constructor(private readonly builder: ReaderValueInputBuilder,
    private readonly provider: ReaderValueScoringProvider) {}

  prepare(source: ReaderPostAssessmentSource) {
    const metadata = source.sourceMetadata.kind === source.providerMetadata.kind ? source.providerMetadata : {};
    if (!classifyReaderValueSourceKind(source.providerKey, metadata).supported) return undefined;
    const prepared = this.builder.prepare({ ...source,
      ...readReaderValueQuotedContext(source.sourceMetadata, source.providerMetadata, source.canonicalUrl),
      ...readReaderValueCapture(source.sourceMetadata, source.providerKey, source.title, source.body,
        { sourceItemId: source.sourceItemId, canonicalUrl: source.canonicalUrl }),
    }, source.contentHash);
    if (!prepared.ok || prepared.value.terminalFailure !== undefined) return undefined;
    const input = prepared.value;
    return { interestId: input.interestId, sourceItemId: input.sourceItemId,
      sourceRevisionKey: input.sourceRevisionKey, sourceSnapshotSha256: input.sourceSnapshotSha256,
      interestSha256: input.interestSha256, rubricVersion: input.rubricVersion,
      rubricSha256: input.rubricSha256, inputBuilderVersion: input.inputBuilderVersion,
      modelConfigVersion: input.modelConfigVersion, requestSha256: input.requestSha256,
      ...(input.snapshot.quotedContext === undefined ? {} : { quotedContext: input.snapshot.quotedContext }),
      ...(input.snapshot.quotedPost === undefined ? {} : { quotedContextCaptured: true as const }),
      matchesInputSha256: (inputSha256: string) => readerValueRequestMatches({ ...input, inputSha256 }, this.provider),
    };
  }
}
