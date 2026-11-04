import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NXT_BROWSER_PORT = 4173;

export function classifyNxtBrowserEnvironment({nodeVersion, filesPresent, testRunnerInstalled, playwrightInstalled, chromiumInstalled, portAvailable, serverAvailable = portAvailable, artifactsWritable}) {
  const major = Number(String(nodeVersion || '').replace(/^v/, '').split('.')[0]);
  let status = 'READY';
  if (!Number.isFinite(major) || major < 22 || !filesPresent || !artifactsWritable) status = 'CONFIG_ERROR';
  else if (!testRunnerInstalled || !playwrightInstalled) status = 'MISSING_DEPENDENCY';
  else if (!chromiumInstalled) status = 'BROWSER_UNAVAILABLE';
  else if (!serverAvailable) status = 'SERVER_UNAVAILABLE';
  const blockers = [];
  if (!Number.isFinite(major) || major < 22 || !filesPresent || !artifactsWritable) blockers.push('CONFIG_ERROR');
  if (!testRunnerInstalled || !playwrightInstalled) blockers.push('MISSING_DEPENDENCY');
  if (!chromiumInstalled) blockers.push('BROWSER_UNAVAILABLE');
  if (!serverAvailable) blockers.push('SERVER_UNAVAILABLE');
  return {status, blockers, nodeVersion, filesPresent, testRunnerInstalled, playwrightInstalled, chromiumInstalled, portAvailable, serverAvailable, artifactsWritable};
}

function canResolve(require, specifier) {
  try { return require.resolve(specifier); } catch { return null; }
}

function isPortFree(port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

function checkWritableDirectory(directory) {
  try {
    fs.mkdirSync(directory, {recursive: true});
    const probe = path.join(directory, `.nxt-browser-write-check-${process.pid}`);
    fs.writeFileSync(probe, 'ok', {flag: 'wx'});
    fs.unlinkSync(probe);
    return true;
  } catch { return false; }
}

async function checkPreviewServer({root, port}) {
  if (!await isPortFree(port)) return {portAvailable: false, serverAvailable: false};
  const child = spawn(process.execPath, ['scripts/nxt-preview-server.js'], {cwd: root, stdio: 'ignore', windowsHide: true});
  let serverAvailable = false;
  child.once('error', () => {});
  try {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      if (child.exitCode !== null) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/preview/nxt/`, {signal: AbortSignal.timeout(250)});
        if (response.ok && (response.headers.get('content-type') || '').startsWith('text/html')) {
          serverAvailable = true;
          break;
        }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 1000))
      ]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
  return {portAvailable: true, serverAvailable};
}

export async function inspectNxtBrowserEnvironment({writeReport = true} = {}) {
  const require = createRequire(path.join(root, 'package.json'));
  const outputDir = path.join(root, 'test-results', 'nxt-browser');
  const requiredFiles = [
    'package.json', 'scripts/build-nxt-preview-data.js', 'scripts/nxt-preview-server.js',
    'preview/nxt/index.html', 'preview/nxt/app.js', 'preview/nxt/styles.css', 'preview/nxt/mock-data.js', 'preview/nxt/review-snapshot.json',
    'browser-tests/nxt/playwright.config.mjs', 'browser-tests/nxt/specs/review-flow.spec.mjs'
  ];
  const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(root, file)));
  const testRunnerPath = canResolve(require, '@playwright/test');
  const playwrightPath = canResolve(require, 'playwright') || canResolve(require, 'playwright-core');
  let chromiumPath = null;
  try {
    const playwright = require(playwrightPath || 'playwright');
    chromiumPath = playwright.chromium.executablePath();
  } catch {}
  const serverCheck = missingFiles.length === 0
    ? await checkPreviewServer({root, port: NXT_BROWSER_PORT})
    : {portAvailable: false, serverAvailable: false};
  const artifactsWritable = checkWritableDirectory(outputDir);
  const status = classifyNxtBrowserEnvironment({
    nodeVersion: process.versions.node,
    filesPresent: missingFiles.length === 0,
    testRunnerInstalled: Boolean(testRunnerPath),
    playwrightInstalled: Boolean(playwrightPath),
    chromiumInstalled: Boolean(chromiumPath && fs.existsSync(chromiumPath)),
    ...serverCheck,
    artifactsWritable
  });
  const report = {
    ...status,
    root,
    requiredFiles,
    missingFiles,
    testRunnerPath,
    playwrightPath,
    chromiumPath,
    port: NXT_BROWSER_PORT,
    outputDir,
    checkedAt: new Date().toISOString()
  };
  if (writeReport && artifactsWritable) fs.writeFileSync(path.join(outputDir, 'preflight.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await inspectNxtBrowserEnvironment();
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'READY') process.exitCode = 2;
}
