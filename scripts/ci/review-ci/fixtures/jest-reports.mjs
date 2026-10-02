// Synthetic reports contain no provider payloads or secrets.
export function completeReports() {
  const trackedPaths = ['libs/a.spec.ts', 'libs/b.spec.ts', 'scripts/c.spec.ts', 'apps/d.spec.ts', 'test/separate.spec.ts', 'test/api.e2e-spec.ts', 'scripts/native.test.mjs'];
  const inventory = trackedPaths.slice(0, 4);
  return { root: '/checkout', trackedPaths, exclusions: ['test/separate.spec.ts'],
    reports: inventory.map((name, index) => ({ shard: index + 1,
      inventory: inventory.map((path) => `/checkout/${path}`),
      execution: { success: true, wasInterrupted: false, numTotalTests: 1,
        numTotalTestSuites: 1, numFailedTests: 0, numFailedTestSuites: 0,
        numRuntimeErrorTestSuites: 0, testResults: [{ name: `/checkout/${name}`,
          status: 'passed', assertionResults: [{ status: 'passed' }] }] },
    })) };
}
