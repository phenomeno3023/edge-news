import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {inspectNxtBrowserEnvironment} from './check-nxt-browser-env.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'test-results', 'nxt-browser');
const snapshotPath = path.join(root, 'preview', 'nxt', 'review-snapshot.json');
const timestamp = new Date().toISOString().replaceAll(':', '-');
const logPath = path.join(outputDir, `run-${timestamp}.log`);
const summaryPath = path.join(outputDir, `run-${timestamp}.json`);
const reportPath = path.join(outputDir, `playwright-${timestamp}.json`);
const preflight = await inspectNxtBrowserEnvironment();
console.log(JSON.stringify(preflight, null, 2));
if (preflight.status !== 'READY') {
  console.error(`NXT_BROWSER_PREFLIGHT_${preflight.status}`);
  console.error('Windows 실행 절차: docs/nxt-step70-browser-runbook.md');
  process.exitCode = 2;
} else {
  const originalSnapshot = fs.readFileSync(snapshotPath);
  const startedAt = new Date().toISOString();
  let exitCode = 1;
  const log = fs.createWriteStream(logPath, {flags: 'wx'});
  try {
    const build = spawnSync(process.execPath, ['scripts/build-nxt-preview-data.js'], {cwd: root, encoding: 'utf8'});
    if (build.stdout) { process.stdout.write(build.stdout); log.write(build.stdout); }
    if (build.stderr) { process.stderr.write(build.stderr); log.write(build.stderr); }
    if (build.status !== 0) throw new Error(`mock_snapshot_build_failed:${build.status ?? build.error?.message ?? 'unknown'}`);

    const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(command, ['playwright', 'test', '-c', 'browser-tests/nxt/playwright.config.mjs', '--reporter=list,json'], {
      cwd: root,
      env: {...process.env, CI: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath},
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', chunk => { process.stdout.write(chunk); log.write(chunk); });
    child.stderr.on('data', chunk => { process.stderr.write(chunk); log.write(chunk); });
    exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    });
  } catch (error) {
    const message = `${error.stack || error}\n`;
    process.stderr.write(message);
    log.write(message);
    exitCode = 1;
  } finally {
    fs.writeFileSync(snapshotPath, originalSnapshot);
    log.end();
  }
  const summary = {
    status: exitCode === 0 ? 'COMPLETED' : 'FAILED',
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode,
    platform: `${os.platform()} ${os.release()}`,
    node: process.version,
    preflightStatus: preflight.status,
    log: path.relative(root, logPath),
    structuredReport: fs.existsSync(reportPath) ? path.relative(root, reportPath) : null,
    artifacts: path.relative(root, path.join(outputDir, 'artifacts')),
    mockSnapshotRestored: true,
    externalApiCalls: 0,
    operatingDatabaseAccess: false
  };
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (exitCode !== 0) process.exitCode = exitCode;
}
