import {
  validateSocialResearchLanguageSdkConformanceReport,
  type SocialResearchLanguageSdkConformanceReport,
} from './social-research-language-sdk-conformance-report';
import { buildSocialResearchLanguageSdkConformanceSuite } from './social-research-language-sdk-conformance-suite';
import { buildSocialResearchTypescriptSdkConformanceReport } from './social-research-typescript-sdk-conformance-report';

describe('validateSocialResearchLanguageSdkConformanceReport', () => {
  it('accepts a complete TypeScript reference report for the language suite', async () => {
    const suite = buildSocialResearchLanguageSdkConformanceSuite();
    const report = await buildSocialResearchTypescriptSdkConformanceReport();

    expect(
      validateSocialResearchLanguageSdkConformanceReport({
        report,
        suite,
        targetLanguage: 'typescript',
      }),
    ).toEqual({
      ok: true,
      violations: [],
    });
  });

  it('rejects reports that drift from operation and case coverage', async () => {
    const suite = buildSocialResearchLanguageSdkConformanceSuite();
    const report = await buildSocialResearchTypescriptSdkConformanceReport();
    const invalidReport: SocialResearchLanguageSdkConformanceReport = {
      ...report,
      caseResults: report.caseResults.slice(1),
    };

    const validation = validateSocialResearchLanguageSdkConformanceReport({
      report: invalidReport,
      suite,
      targetLanguage: 'typescript',
    });

    expect(validation.ok).toBe(false);
    expect(validation.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('report.caseResults.caseId expected'),
        expect.stringContaining('report.summary.caseChecks.total expected'),
      ]),
    );
  });
});
