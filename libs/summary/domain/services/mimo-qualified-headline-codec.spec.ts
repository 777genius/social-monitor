import { decodeMimoQualifiedHeadlines, mimoQualifiedHeadlineOutputSchema, MIMO_QUALIFIED_HEADLINE_CONTRACT } from './mimo-qualified-headline-codec';
import { readerPostPresentationReferenceCatalog } from './reader-post-presentation-reference-catalog';
const candidate = { candidateId: 'synthetic', title: 'Useful database method', sourceText: 'Useful method only in preview on Linux.' };
function wire() {
  const reference = readerPostPresentationReferenceCatalog(candidate).find(r => r.field === 'bodyPreview')!;
  return { contractVersion: MIMO_QUALIFIED_HEADLINE_CONTRACT, presentations: [{
    candidateId: candidate.candidateId, status: 'available', kind: 'claim', baseHeadline: 'Useful database method',
    support: [reference], qualifications: [{ phrase: 'only in preview', evidence: [reference] },
      { phrase: 'on Linux', evidence: [reference] }], confidence: 0.9,
  }] };
}
describe('versioned MiMo qualified-headline composition', () => {
  it('composes every declared phrase and derives judgment without changing the attested wire', () => {
    const raw = wire(), before = JSON.stringify(raw), result = decodeMimoQualifiedHeadlines(raw, [candidate]);
    expect(result.failure).toBeNull();
    expect(result.output?.presentations[0]).toMatchObject({
      text: 'Useful database method (only in preview; on Linux)', qualificationJudgment: 'preserved',
    });
    expect(JSON.stringify(raw)).toBe(before);
    raw.presentations[0]!.qualifications = [];
    expect(decodeMimoQualifiedHeadlines(raw, [candidate]).output?.presentations[0])
      .toMatchObject({ text: 'Useful database method', qualificationJudgment: 'none' });
  });
  it.each<[string, (raw: ReturnType<typeof wire>) => void]>([
    ['wrong evidence', r => { r.presentations[0]!.qualifications[0]!.evidence[0] = { field: 'bodyPreview', start: 0, end: 7, quote: 'Changed' }; }],
    ['overlength composed text', r => { r.presentations[0]!.baseHeadline = 'Useful ' + 'a'.repeat(100); }],
    ['duplicate phrase', r => { r.presentations[0]!.qualifications[1]!.phrase = 'only in preview'; }],
    ['unsafe phrase', r => { r.presentations[0]!.qualifications[0]!.phrase = 'https://example.test'; }],
    ['unsafe base', r => { r.presentations[0]!.baseHeadline = 'We just dropped a method'; }],
    ['old text field', r => { Object.assign(r.presentations[0]!, { text: 'Useful method' }); }],
    ['old judgment field', r => { Object.assign(r.presentations[0]!, { qualificationJudgment: 'none' }); }],
  ])('rejects %s through the unchanged canonical validators', (_name, mutate) => {
    const raw = wire(); mutate(raw);
    expect(decodeMimoQualifiedHeadlines(raw, [candidate]).output).toBeNull();
  });
  it('rejects body substitution and unversioned old proposals', () => {
    expect(decodeMimoQualifiedHeadlines(wire(), [{ ...candidate, sourceText: 'Changed source.' }]).output).toBeNull();
    expect(decodeMimoQualifiedHeadlines({ presentations: [] }, [candidate]).output).toBeNull();
  });
  it('keeps the exact composed UTF-16 size boundary', () => {
    const raw = wire(), suffix = ' (only in preview; on Linux)';
    raw.presentations[0]!.baseHeadline = 'A'.repeat(119 - suffix.length);
    expect(decodeMimoQualifiedHeadlines(raw, [candidate]).output?.presentations[0]?.text).toHaveLength(119);
    raw.presentations[0]!.baseHeadline += 'A';
    expect(decodeMimoQualifiedHeadlines(raw, [candidate]).output).toBeNull();
  });
  it('derives subject_only only for an unchanged valid subject-label grammar', () => {
    const source = { candidateId: 'synthetic', title: 'Acme model', sourceText: 'Acme model' };
    const refs = readerPostPresentationReferenceCatalog(source);
    const raw = wire();
    Object.assign(raw.presentations[0]!, { kind: 'subject_label', baseHeadline: 'Acme model discussion',
      support: [refs.find(r => r.quote === 'Acme')!, refs.find(r => r.quote === 'model')!], qualifications: [] });
    expect(decodeMimoQualifiedHeadlines(raw, [source]).output?.presentations[0]?.qualificationJudgment).toBe('subject_only');
    raw.presentations[0]!.baseHeadline = 'Acme model release';
    expect(decodeMimoQualifiedHeadlines(raw, [source]).output).toBeNull();
  });
  it('registers only the new versioned fields while retaining exact catalog reference enums', () => {
    const schema = mimoQualifiedHeadlineOutputSchema([candidate]);
    const branch = schema.properties.presentations.items.oneOf[0]!;
    expect(schema.properties.contractVersion.const).toBe(MIMO_QUALIFIED_HEADLINE_CONTRACT);
    expect(branch.required).toContain('baseHeadline');
    expect(branch.properties).not.toHaveProperty('text');
    expect(branch.properties).not.toHaveProperty('qualificationJudgment');
    expect(branch.properties.qualifications.items.properties.evidence.items.enum).toEqual(readerPostPresentationReferenceCatalog(candidate));
  });
});
