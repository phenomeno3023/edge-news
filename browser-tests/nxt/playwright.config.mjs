import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  expect: {timeout: 5_000},
  reporter: 'list',
  use: {baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', headless: true},
  webServer: {
    command: 'node scripts/build-nxt-preview-data.js && python3 -m http.server 4173 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4173/preview/nxt/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
