// Require the exact readiness script token or its backend-safe inventory entry.
export function validateExternalBetaNpmVerification({ scripts, verifyScript, backendSafeScripts, packagePath, violations }) {
  const hasVerificationScript = (scriptName) =>
    new RegExp(`npm run ${scriptName}(?=\\s|[;&|]|$)`).test(verifyScript) || backendSafeScripts.has(scriptName);

  if (!scripts['check:external-beta-readiness']) {
    violations.push(`${packagePath}: missing check:external-beta-readiness`);
  }
  if (!hasVerificationScript('check:external-beta-readiness')) {
    violations.push(`${packagePath}: npm run verify or verify:backend must include check:external-beta-readiness`);
  }
}
