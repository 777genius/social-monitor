// Preserve original npm verification/backend-safe admission and diagnostic order.
export function validateExternalBetaNpmVerification({ scripts, verifyScript, backendSafeScripts, packagePath, violations }) {
  const hasVerificationScript = (scriptName) =>
    verifyScript.includes(`npm run ${scriptName}`) || backendSafeScripts.has(scriptName);

  if (!scripts['check:external-beta-readiness']) {
    violations.push(`${packagePath}: missing check:external-beta-readiness`);
  }
  if (!hasVerificationScript('check:external-beta-readiness')) {
    violations.push(`${packagePath}: npm run verify or verify:backend must include check:external-beta-readiness`);
  }
}
