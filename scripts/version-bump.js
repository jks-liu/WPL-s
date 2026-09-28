#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  console.error(`version:bump: ${message}`);
  process.exit(1);
}

function readJson(file) {
  const source = fs.readFileSync(file, 'utf8');
  return {
    source,
    data: JSON.parse(source),
  };
}

function parseVersion(value) {
  const match = versionPattern.exec(value);
  if (!match) fail(`invalid version "${value}" (expected major.minor.patch)`);
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part))) {
    fail(`version "${value}" contains a number that is too large`);
  }
  return parts;
}

function replaceVersions(file, document, oldVersion, nextVersion, expectedCount) {
  let count = 0;
  const output = document.source.replace(/^([ \t]*"version"[ \t]*:[ \t]*")([^"]+)(")/gm, (match, prefix, value, suffix) => {
    if (count >= expectedCount) return match;
    if (value !== oldVersion) fail(`unexpected version field in ${path.basename(file)}`);
    count += 1;
    return `${prefix}${nextVersion}${suffix}`;
  });
  if (count !== expectedCount || document.data.version !== oldVersion) {
    fail(`could not update version fields in ${path.basename(file)}`);
  }
  return output;
}

try {
  const args = process.argv.slice(2);
  const levels = args.filter((arg) => !arg.startsWith('--'));
  const flags = args.filter((arg) => arg.startsWith('--'));
  if (levels.length > 1 || flags.some((flag) => !['--build', '--no-build'].includes(flag)) ||
      (flags.includes('--build') && flags.includes('--no-build'))) {
    fail('usage: npm run version:bump -- [patch|minor|major|X.Y.Z|current] [--build|--no-build]');
  }

  const level = levels[0] || 'patch';
  const build = flags.includes('--build');
  if (level === 'current' && flags.length) fail('current does not accept build options');

  const manifest = readJson(packagePath);
  const lock = readJson(lockPath);
  const current = manifest.data.version;
  const [major, minor, patch] = parseVersion(current);
  if (lock.data.version !== current || lock.data.packages?.['']?.version !== current ||
      lock.data.name !== manifest.data.name || lock.data.packages?.['']?.name !== manifest.data.name) {
    fail('package.json and package-lock.json are not synchronized');
  }

  if (level === 'current') {
    console.log(current);
    process.exit(0);
  }

  let next;
  switch (level) {
    case 'patch': next = `${major}.${minor}.${patch + 1}`; break;
    case 'minor': next = `${major}.${minor + 1}.0`; break;
    case 'major': next = `${major + 1}.0.0`; break;
    default:
      parseVersion(level);
      next = level;
  }
  parseVersion(next);

  const nextManifest = replaceVersions(packagePath, manifest, current, next, 1);
  const nextLock = replaceVersions(lockPath, lock, current, next, 2);
  if (nextManifest !== manifest.source) fs.writeFileSync(packagePath, nextManifest);
  if (nextLock !== lock.source) fs.writeFileSync(lockPath, nextLock);
  console.log(`${current} -> ${next}`);

  if (build) {
    const result = spawnSync('npm run vsix', { cwd: root, shell: true, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
} catch (error) {
  fail(error.message);
}
