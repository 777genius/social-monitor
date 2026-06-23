import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const packagePath = 'package.json';
const lockPath = 'package-lock.json';
const sdkPackage = '@infinity-context/sdk';
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const lockJson = JSON.parse(readFileSync(lockPath, 'utf8'));
const dependencySpec = packageJson.dependencies?.[sdkPackage];
const profile = (process.env.SUMMARY_MEMORY_SDK_PACKAGE_PROFILE ?? 'dev').trim().toLowerCase();
const registryOnlyProfiles = new Set(['production', 'prod']);
const artifactProfiles = new Set(['beta', 'staging', 'rc', 'release-candidate']);

assert.equal(typeof dependencySpec, 'string', `${packagePath}: dependencies.${sdkPackage} must be declared`);

if (registryOnlyProfiles.has(profile)) {
  assert(
    !dependencySpec.startsWith('file:'),
    `${packagePath}: ${sdkPackage} must not use a local file: dependency for ${profile}`,
  );
  assert(
    !lockJson.packages?.[`node_modules/${sdkPackage}`]?.link,
    `${lockPath}: ${sdkPackage} must not be a symlinked local package for ${profile}`,
  );
} else if (dependencySpec.startsWith('file:')) {
  const localPath = resolve(dirname(packagePath), dependencySpec.slice('file:'.length));
  if (dependencySpec.endsWith('.tgz')) {
    assert(existsSync(localPath), `${packagePath}: ${sdkPackage} tarball dependency is missing at ${localPath}`);
    assert(statSync(localPath).isFile(), `${packagePath}: ${sdkPackage} tarball dependency must be a file`);
    assert(
      dependencySpec.startsWith('file:vendor/'),
      `${packagePath}: ${sdkPackage} tarball dependency must live under vendor/`,
    );
    assert(
      lockJson.packages?.[`node_modules/${sdkPackage}`]?.link !== true,
      `${lockPath}: tarball ${sdkPackage} dependency must not be recorded as a package-lock link`,
    );
    assert.equal(
      typeof lockJson.packages?.[`node_modules/${sdkPackage}`]?.integrity,
      'string',
      `${lockPath}: tarball ${sdkPackage} dependency must include integrity`,
    );
  } else {
    assert(
      !artifactProfiles.has(profile),
      `${packagePath}: ${sdkPackage} must use a tarball or registry package for ${profile}, not a local directory`,
    );
    const sdkPackagePath = resolve(localPath, 'package.json');
    assert(existsSync(sdkPackagePath), `${packagePath}: ${sdkPackage} local file dependency is missing at ${sdkPackagePath}`);
    const sdkPackageJson = JSON.parse(readFileSync(sdkPackagePath, 'utf8'));
    assert.equal(sdkPackageJson.name, sdkPackage, `${sdkPackagePath}: package name must be ${sdkPackage}`);
    assert.equal(typeof sdkPackageJson.version, 'string', `${sdkPackagePath}: package version must be declared`);
    assert(
      lockJson.packages?.[`node_modules/${sdkPackage}`]?.link === true,
      `${lockPath}: local ${sdkPackage} dependency must be recorded as a package-lock link`,
    );
  }
}

const require = createRequire(import.meta.url);
const resolved = require.resolve(sdkPackage);
const sdk = require(sdkPackage);
assert.equal(typeof sdk.InfinityContextClient, 'function', `${sdkPackage}: InfinityContextClient export is required`);
assert.equal(typeof sdk.createMemoryReviewPlan, 'function', `${sdkPackage}: createMemoryReviewPlan export is required`);

console.log([
  'Summary memory SDK package OK',
  `Profile: ${profile}`,
  `Spec: ${dependencySpec}`,
  `Resolved: ${resolved}`,
].join('\n'));
