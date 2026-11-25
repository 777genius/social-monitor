import type { Clock } from "@social-monitor/shared-kernel";
import type { SourceContentSafetyPolicy } from "@social-monitor/relevance/domain/source-content-safety";
import type { ReaderValueExistingAssessment } from '@social-monitor/relevance/application/contracts/reader-value-existing-assessment';
import type { ReaderValueInputBuilder, ReaderValueInventory, ReaderValueInventoryCursor } from '@social-monitor/relevance/application/contracts/reader-value-inventory';
import { compareReaderValueTimestamps } from '@social-monitor/relevance/domain/reader-value/canonical-reader-value-timestamp';
import { classifyReaderValueSourceKind } from '@social-monitor/relevance/domain/reader-value/reader-value-source-kind';
import type { ConfiguredInterestReaderPort } from '@social-monitor/relevance/ports';
import type { ReaderSummaryCandidateQualification, ReaderSummaryCandidateQualificationAudit } from '../../application/contracts/reader-summary-candidate-qualification';
import { isGitHubTrendingEvidence } from '../../domain';

export class JevReaderSummaryCandidateQualification implements ReaderSummaryCandidateQualification {
  constructor(private readonly inventory: ReaderValueInventory,
    private readonly builder: ReaderValueInputBuilder,
    private readonly assessments: ReaderValueExistingAssessment,
    private readonly interests: ConfiguredInterestReaderPort,
    private readonly clock: Clock,
    private readonly safety: SourceContentSafetyPolicy,
    private readonly observe: (audit: ReaderSummaryCandidateQualificationAudit) => void) {}

  async qualify(params: Parameters<ReaderSummaryCandidateQualification['qualify']>[0],
    items: Parameters<ReaderSummaryCandidateQualification['qualify']>[1]) {
    if (params.observedThrough === undefined || params.timestampPolicy === 'observed_at') {
      throw new Error('Jev capture qualification requires a published window and explicit cutoff');
    }
    const cutoff = params.observedThrough.toISOString();
    const assessmentCutoff = this.clock.now().toISOString();
    if (compareReaderValueTimestamps(assessmentCutoff, cutoff) < 0) {
      throw new Error("Jev assessment knowledge cutoff precedes the source cutoff");
    }
    const wanted = new Map(items.filter((item) => !isGitHubTrendingEvidence(item))
      .map((item) => [item.feedItemId, item] as const));
    const decisions = new Map<string, ReaderSummaryCandidateQualificationAudit['candidates'][number]>();
    let bytes = 0;
    let scanned = 0;
    for (const interestId of new Set([...wanted.values()].map((item) => item.interestId))) {
      const scope = { tenantId: params.tenantId, workspaceId: params.workspaceId, interestId };
      const current = await this.interests.readCurrent(scope);
      if (current.kind !== 'available') throw new Error('Current Jev interest is unavailable');
      let cursor: ReaderValueInventoryCursor | undefined;
      do {
        const page = await this.inventory.page(scope, params.period.startedAt.toISOString(),
          cursor, 25, 32 * 1024 * 1024 - bytes);
        if (page.length === 0) break;
        for (const entry of page) {
          cursor = entry.cursor;
          bytes += Buffer.byteLength(entry.source.title) + Buffer.byteLength(entry.source.body);
          if (++scanned > 10_000 || bytes > 32 * 1024 * 1024) {
            throw new Error('Jev capture qualification exceeds its finite inventory budget');
          }
          const item = wanted.get(entry.cursor.feedItemId);
          if (item === undefined) continue;
          if (entry.source.tenantId !== scope.tenantId || entry.source.workspaceId !== scope.workspaceId ||
              entry.source.interestId !== interestId || entry.source.interest !== current.interest.query ||
              entry.source.sourceItemId !== item.sourceItemId || entry.sourceBindingId !== item.sourceBindingId ||
              entry.source.providerKey !== item.providerKey || entry.source.canonicalUrl !== item.canonicalUrl ||
              compareReaderValueTimestamps(entry.cursor.publishedAt, params.period.startedAt.toISOString()) < 0 ||
              compareReaderValueTimestamps(entry.cursor.publishedAt, params.period.endedAt.toISOString()) >= 0 ||
              compareReaderValueTimestamps(entry.observedAt, cutoff) > 0 ||
              compareReaderValueTimestamps(entry.sourceUpdatedAt, cutoff) > 0 ||
              entry.source.availableAt === null || compareReaderValueTimestamps(entry.source.availableAt, cutoff) > 0) continue;
          const kind = classifyReaderValueSourceKind(entry.source.providerKey, entry.metadata);
          if (!kind.supported || kind.appendixOnly) continue;
          // Bind the entire reader-visible projection to the assessed current
          // source, never a prefix. Ranking sanitizes full retained source text.
          const visible = this.safety.evaluate({ providerKey: entry.source.providerKey,
            canonicalUrl: entry.source.canonicalUrl, title: entry.source.title,
            bodyPreview: entry.source.body });
          if (visible.status === 'blocked' || visible.sanitizedTitle !== item.title ||
              visible.sanitizedCanonicalUrl !== item.canonicalUrl ||
              (visible.sanitizedBodyPreview ?? '') !== item.sourceText ||
              (visible.sanitizedBodyPreview ?? '') !== (item.bodyPreview ?? '')) continue;
          const prepared = this.builder.prepare(entry.source, entry.sourceRevisionKey);
          if (!prepared.ok || prepared.value.terminalFailure !== undefined) continue;
          const assessment = await this.assessments.find(prepared.value);
          if (assessment === null || assessment.state !== 'assessed' || assessment.answers === null ||
              assessment.assessedAt === null || compareReaderValueTimestamps(assessment.assessedAt, assessmentCutoff) > 0) continue;
          const admitted = ['useful', 'important'].includes(assessment.answers.usefulness.choice) &&
            ['relevant', 'central'].includes(assessment.answers.relevance.choice);
          decisions.set(item.feedItemId, { feedItemId: item.feedItemId, admitted,
            assessmentId: assessment.id, inputSha256: prepared.value.inputSha256,
            sourceSnapshotSha256: prepared.value.sourceSnapshotSha256,
            interestSha256: prepared.value.interestSha256, assessedAt: assessment.assessedAt });
        }
        if (page.length < 25 || (cursor !== undefined &&
            compareReaderValueTimestamps(cursor.publishedAt, params.period.endedAt.toISOString()) >= 0)) break;
      } while (cursor !== undefined);
      const after = await this.interests.readCurrent(scope);
      if (after.kind !== 'available' || after.interest.query !== current.interest.query) {
        throw new Error('Jev interest changed during capture qualification');
      }
    }
    const audit: ReaderSummaryCandidateQualificationAudit = {
      schemaVersion: 'reader_summary.jev_capture_qualification.v1',
      tenantId: params.tenantId, workspaceId: params.workspaceId, cutoffAt: cutoff, assessmentCutoffAt: assessmentCutoff,
      candidates: [...wanted.keys()].map((feedItemId) => decisions.get(feedItemId) ??
        { feedItemId, admitted: false }),
    };
    this.observe(audit);
    return { items: items.filter((item) => isGitHubTrendingEvidence(item) ||
      decisions.get(item.feedItemId)?.admitted === true), audit };
  }
}
