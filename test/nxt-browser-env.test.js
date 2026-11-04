import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyNxtBrowserEnvironment} from '../scripts/check-nxt-browser-env.js';

const ready = {
  nodeVersion: 'v22.12.0', filesPresent: true, testRunnerInstalled: true,
  playwrightInstalled: true, chromiumInstalled: true, portAvailable: true, artifactsWritable: true
};

test('사전 점검은 모든 필수 항목이 준비되면 READY를 반환한다', () => {
  assert.equal(classifyNxtBrowserEnvironment(ready).status, 'READY');
});

test('Node 버전·필수 파일·결과 폴더 문제는 CONFIG_ERROR로 구분한다', () => {
  assert.equal(classifyNxtBrowserEnvironment({...ready, nodeVersion: 'v20.0.0'}).status, 'CONFIG_ERROR');
  assert.equal(classifyNxtBrowserEnvironment({...ready, filesPresent: false}).status, 'CONFIG_ERROR');
  assert.equal(classifyNxtBrowserEnvironment({...ready, artifactsWritable: false}).status, 'CONFIG_ERROR');
});

test('Playwright 패키지가 없으면 MISSING_DEPENDENCY로 처리한다', () => {
  assert.equal(classifyNxtBrowserEnvironment({...ready, testRunnerInstalled: false}).status, 'MISSING_DEPENDENCY');
  assert.equal(classifyNxtBrowserEnvironment({...ready, playwrightInstalled: false}).status, 'MISSING_DEPENDENCY');
});

test('브라우저 실행 파일이 없으면 BROWSER_UNAVAILABLE로 처리한다', () => {
  assert.equal(classifyNxtBrowserEnvironment({...ready, chromiumInstalled: false}).status, 'BROWSER_UNAVAILABLE');
});

test('localhost 포트가 사용 중이면 SERVER_UNAVAILABLE로 처리한다', () => {
  assert.equal(classifyNxtBrowserEnvironment({...ready, portAvailable: false}).status, 'SERVER_UNAVAILABLE');
  assert.equal(classifyNxtBrowserEnvironment({...ready, portAvailable: true, serverAvailable: false}).status, 'SERVER_UNAVAILABLE');
});

test('동시에 누락된 항목은 최종 상태와 blockers에 각각 남긴다', () => {
  const result = classifyNxtBrowserEnvironment({...ready, testRunnerInstalled: false, chromiumInstalled: false, portAvailable: false});
  assert.equal(result.status, 'MISSING_DEPENDENCY');
  assert.deepEqual(result.blockers, ['MISSING_DEPENDENCY', 'BROWSER_UNAVAILABLE', 'SERVER_UNAVAILABLE']);
});
