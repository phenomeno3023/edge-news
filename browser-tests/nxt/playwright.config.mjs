import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: {timeout: 5_000},
  reporter: 'list',
  outputDir: '../../test-results/nxt-browser/artifacts',
  preserveOutput: 'always',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node scripts/nxt-preview-server.js',
    url: 'http://127.0.0.1:4173/preview/nxt/',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
