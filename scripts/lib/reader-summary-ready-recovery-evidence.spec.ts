import { readyRecoveryFixture } from './reader-summary-ready-recovery-fixture';
import { canonicalSha256 } from './reader-summary-ready-recovery-manifest';
import { validateRecoveryEvidence } from './reader-summary-ready-recovery-evidence';

describe('historical recovery publication lifecycle', () => {
  let f: ReturnType<typeof readyRecoveryFixture>;
  beforeEach(() => { f = readyRecoveryFixture(); });
  afterEach(() => f.cleanup());
  it.each(['COMPLETED', 'NO_SIGNAL'])('accepts superseded immutable %s without rewriting semantic status', async status => {
    const s = f.snapshots[0]!, p = s.publication!, a = p.readerSummaryArtifact;
    a.status = 'SUPERSEDED';
    p.semanticStatus = status; p.readerSummaryJob!.status = status;
    s.row = { ...s.row, payload: { ...(s.row.payload as object), status: status.toLowerCase() } };
    p.reportSha256 = canonicalSha256({ schemaVersion: 'reader_summary.publication_report.v1', semanticStatus: status,
      modelVersion: a.modelVersion, promptVersion: a.promptVersion, headline: a.headline, summaryText: a.summaryText,
      artifactPayload: a.artifactPayload, citations: a.citations, qualitySignals: a.qualitySignals });
    p.exactProof = { ...(p.exactProof as object), semanticStatus: status, reportSha256: p.reportSha256 };
    p.proofSha256 = canonicalSha256(p.exactProof);
    Object.assign(f.manifest.events[0]!, { reportSha256: p.reportSha256, proofSha256: p.proofSha256, payloadSha256: canonicalSha256(s.row.payload) });
    const immutable = canonicalSha256(p);
    await expect(f.run()).resolves.toMatchObject({ consumed: 1 });
    expect(canonicalSha256(p)).toBe(immutable);
    expect(p.semanticStatus).toBe(status);
  });
  it.each(['FAILED', 'PENDING', 'QUALITY_REJECTED', 'NO_SIGNAL'])('rejects incompatible artifact lifecycle %s', async status => {
    f.snapshots[0]!.publication!.readerSummaryArtifact.status = status;
    await expect(validateRecoveryEvidence(f.manifest.events[0]!, f.snapshots[0]!)).rejects.toThrow('publication_links_mismatch');
  });
  it.each(['report', 'proof', 'job-status', 'job-id', 'artifact-id', 'tenant', 'workspace', 'period'])('still rejects superseded %s mutation', async mutation => {
    const p = f.snapshots[0]!.publication!;
    p.readerSummaryArtifact.status = 'SUPERSEDED';
    if (mutation === 'report') p.readerSummaryArtifact.headline = 'Changed content';
    if (mutation === 'proof') p.exactProof = { ...(p.exactProof as object), changed: true };
    if (mutation === 'job-status') p.readerSummaryJob!.status = 'SUPERSEDED';
    if (mutation === 'job-id') p.readerSummaryJob!.id = 'foreign';
    if (mutation === 'artifact-id') p.readerSummaryArtifact.id = 'foreign';
    if (mutation === 'tenant') p.readerSummaryArtifact.tenantId = 'foreign';
    if (mutation === 'workspace') p.readerSummaryArtifact.workspaceId = 'foreign';
    if (mutation === 'period') p.readerSummaryArtifact.periodKey = 'foreign';
    await expect(f.run()).rejects.toThrow();
    expect(f.channel.publish).not.toHaveBeenCalled();
  });
});
